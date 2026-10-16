import 'server-only';

import { connection } from 'next/server';
import { cache } from 'react';
import { z } from 'zod';

import type { RolUsuario } from '@/components/armazon/modulos';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import type { Centimos } from '@/lib/dinero/importe';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { hoyEn, leerRol } from '../../agenda/bloques';
import { importeDeBd } from '../presentacion';
import { leerBono, type EstadoBono, type LecturaBono } from './estado';

/**
 * Lecturas de `/facturacion/bonos` y de la ficha (T-027 §1.5), memoizadas POR PETICIÓN con `cache()`
 * de React. NUNCA `use cache` (ADR-043): el bono de un paciente no entra en ninguna caché compartida.
 * Todo va bajo RLS: `bonos_consumo` y `bonos` ya recortan por rol; los filtros solo estrechan.
 *
 * `max_rows` de PostgREST es 1000: la vista se lee de 1000 en 1000 hasta agotarla, y los id que
 * van en la URL, en trozos de 200.
 */

type ParametrosDeBusqueda = Promise<Record<string, string | string[] | undefined>>;

const TAMANO_LOTE = 1000;
const TROZO_DE_IDS = 200;

const ESTADOS: readonly EstadoBono[] = ['vigente', 'agotado', 'caducado'];

export type BonoConPaciente = {
  bonoId: string;
  pacienteId: string;
  nombre: string;
  apellidos: string;
  profesionalId: string | null;
  sesionesTotales: number;
  sesionesConsumidas: number;
  caducidad: string | null;
  importe: Centimos;
  creadoEn: string;
  lectura: LecturaBono;
};
export type ResultadoBonos = { ok: true; bonos: BonoConPaciente[] } | { ok: false };

export type ContextoBonos = {
  rol: RolUsuario | null;
  hoy: string;
  zona: string;
  estado: EstadoBono | null;
  /** Solo para el administrador; para el resto, siempre null. */
  profesional: string | null;
  /** Solo para el administrador; para el resto, siempre null. */
  paciente: string | null;
  pagina: number;
};

export type OpcionProfesional = { id: string; nombre: string };
export type ResultadoProfesionales = { ok: true; opciones: OpcionProfesional[] } | { ok: false };

const cargarSesion = cache(exigirSesion);

const esquemaUuid = z.uuid();
const esquemaPagina = z.coerce.number().int().min(1);

function aTrozos<T>(lista: T[], tamano: number): T[][] {
  const trozos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) trozos.push(lista.slice(i, i + tamano));
  return trozos;
}

/** «Hoy» y la zona de la organización. Sin `searchParams`: lo usa también la ficha del paciente. */
export const cargarRelojDeBonos = cache(async (): Promise<{ hoy: string; zona: string }> => {
  await connection();
  const { supabase } = await cargarSesion();
  const { data: zona, error } = await supabase.rpc('zona_horaria_centro', {
    // El generador no modela el null que la función acepta (como en `cargarContexto`).
    p_centro_id: null as unknown as string,
  });
  if (error || typeof zona !== 'string' || zona.length === 0) {
    throw new Error(`Bonos: no se pudo leer la zona de la organización (${error?.code ?? 'vacía'}).`);
  }
  return { hoy: hoyEn(new Date(), zona), zona };
});

/**
 * ¿Se puede registrar un bono a este paciente? Un paciente fusionado no (ADR-031: sus citas viven en el
 * superviviente). Si no se puede leer, tampoco: más vale no ofrecer el botón que ofrecer uno que falle.
 */
export const pacienteAdmiteBonos = cache(async (pacienteId: string): Promise<boolean> => {
  const { supabase } = await cargarSesion();
  const { data, error } = await supabase.from('pacientes').select('fusionado_en').eq('id', pacienteId).maybeSingle();
  if (error) {
    console.error('pacienteAdmiteBonos: fallo al leer el paciente', error.code);
    return false;
  }
  return data !== null && data.fusionado_en === null;
});

/**
 * Rol, filtros, página, zona y reloj. El rol lo decide la base (`estado_de_cuenta()`). `?profesional` y
 * `?paciente` **solo se miran** si quien pide es administrador (choque 13): para cualquier otro se ignoran
 * sin leerlos, y aunque se colaran, la RLS seguiría recortando. `?estado` es una lista blanca; cualquier
 * otro valor es «todos».
 */
export const cargarContextoBonos = cache(async (searchParams: ParametrosDeBusqueda): Promise<ContextoBonos> => {
  await connection();
  const sesion = await cargarSesion();
  const rol = leerRol((await estadoDeCuenta(sesion))?.rol);

  const parametros = await searchParams;
  const estado = ESTADOS.find((e) => e === parametros.estado) ?? null;
  let profesional: string | null = null;
  let paciente: string | null = null;
  if (rol === 'administrador') {
    const p = esquemaUuid.safeParse(parametros.profesional);
    profesional = p.success ? p.data : null;
    const q = esquemaUuid.safeParse(parametros.paciente);
    paciente = q.success ? q.data : null;
  }
  const numeroPagina = esquemaPagina.safeParse(parametros.pagina);

  const { hoy, zona } = await cargarRelojDeBonos();

  return {
    rol,
    hoy,
    zona,
    estado,
    profesional,
    paciente,
    pagina: numeroPagina.success ? numeroPagina.data : 1,
  };
});

type FilaConsumo = { bono_id: string; paciente_id: string; sesiones_totales: number; sesiones_consumidas: number; caducidad: string | null };

/**
 * Los bonos que ve quien pide, con su estado derivado por `leerBono` (la única fuente de saldo y estado)
 * de las columnas de `bonos_consumo`. Después, el importe (`importe::text`) de `bonos` y el nombre y el
 * profesional de `pacientes`. Un error en cualquier lectura es `{ ok: false }`: nunca una lista a medias.
 * Con `pacienteId`, solo los de ese paciente (la ficha).
 */
export const cargarBonos = cache(async (hoy: string, pacienteId?: string): Promise<ResultadoBonos> => {
  const { supabase } = await cargarSesion();

  // 1. La vista, de 1000 en 1000 y con el id como último desempate.
  const consumo = new Map<string, FilaConsumo>();
  let descartadas = 0;
  for (let desde = 0; ; desde += TAMANO_LOTE) {
    let consulta = supabase
      .from('bonos_consumo')
      .select('bono_id, paciente_id, sesiones_totales, sesiones_consumidas, caducidad');
    if (pacienteId) consulta = consulta.eq('paciente_id', pacienteId);
    const { data, error } = await consulta.order('bono_id').range(desde, desde + TAMANO_LOTE - 1);
    if (error || !data) {
      console.error('cargarBonos: fallo al leer bonos_consumo', error?.code);
      return { ok: false };
    }
    for (const f of data) {
      // Una vista tipa todo como nullable: una fila a medias se descarta, nunca se pinta como «NaN».
      if (
        f.bono_id === null ||
        f.paciente_id === null ||
        typeof f.sesiones_totales !== 'number' ||
        typeof f.sesiones_consumidas !== 'number'
      ) {
        descartadas += 1;
        continue;
      }
      if (!consumo.has(f.bono_id)) {
        consumo.set(f.bono_id, {
          bono_id: f.bono_id,
          paciente_id: f.paciente_id,
          sesiones_totales: f.sesiones_totales,
          sesiones_consumidas: f.sesiones_consumidas,
          caducidad: f.caducidad,
        });
      }
    }
    if (data.length < TAMANO_LOTE) break;
  }
  if (descartadas > 0) console.error(`cargarBonos: ${descartadas} fila(s) de bonos_consumo con columnas nulas, descartadas`);
  if (consumo.size === 0) return { ok: true, bonos: [] };

  // 2. El importe y la fecha de alta, de `bonos`.
  const alta = new Map<string, { importe: string; creado_en: string }>();
  for (const trozo of aTrozos([...consumo.keys()], TROZO_DE_IDS)) {
    const { data, error } = await supabase.from('bonos').select('id, importe::text, creado_en').in('id', trozo);
    if (error || !data) {
      console.error('cargarBonos: fallo al leer los importes', error?.code);
      return { ok: false };
    }
    for (const b of data) alta.set(b.id, { importe: b.importe, creado_en: b.creado_en });
  }

  // 3. El nombre y el profesional del paciente.
  const pacientes = new Map<string, { nombre: string; apellidos: string; profesional_id: string | null }>();
  const idsPacientes = [...new Set([...consumo.values()].map((f) => f.paciente_id))];
  for (const trozo of aTrozos(idsPacientes, TROZO_DE_IDS)) {
    const { data, error } = await supabase
      .from('pacientes')
      .select('id, nombre, apellidos, profesional_id')
      .in('id', trozo);
    if (error || !data) {
      console.error('cargarBonos: fallo al leer los pacientes', error?.code);
      return { ok: false };
    }
    for (const p of data) pacientes.set(p.id, p);
  }

  const bonos: BonoConPaciente[] = [];
  let sinImporte = 0;
  for (const f of consumo.values()) {
    const datosAlta = alta.get(f.bono_id);
    if (!datosAlta) {
      sinImporte += 1;
      continue;
    }
    let importe: Centimos;
    try {
      importe = importeDeBd(datosAlta.importe);
    } catch (e) {
      console.error('cargarBonos:', e instanceof Error ? e.message : e);
      return { ok: false };
    }
    const paciente = pacientes.get(f.paciente_id);
    bonos.push({
      bonoId: f.bono_id,
      pacienteId: f.paciente_id,
      nombre: paciente?.nombre ?? t('bonos.pacienteDesconocido'),
      apellidos: paciente?.apellidos ?? '',
      profesionalId: paciente?.profesional_id ?? null,
      sesionesTotales: f.sesiones_totales,
      sesionesConsumidas: f.sesiones_consumidas,
      caducidad: f.caducidad,
      importe,
      creadoEn: datosAlta.creado_en,
      lectura: leerBono(
        { sesionesTotales: f.sesiones_totales, sesionesConsumidas: f.sesiones_consumidas, caducidad: f.caducidad },
        hoy,
      ),
    });
  }
  if (sinImporte > 0) console.error(`cargarBonos: ${sinImporte} bono(s) de la vista sin fila visible en bonos, descartados`);
  return { ok: true, bonos };
});

/**
 * Solo para el administrador (lo decide `page.tsx`): los nombres de los profesionales que aparecen en los
 * bonos cargados, del directorio (`directorio_perfiles`; `perfiles` solo enseña al administrador su propia
 * fila). Un fallo es `{ ok: false }`: la pantalla avisa en lugar de ofrecer un selector incompleto.
 */
export async function cargarProfesionalesDeBonos(ids: string[]): Promise<ResultadoProfesionales> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return { ok: true, opciones: [] };
  const { supabase } = await cargarSesion();

  const opciones: OpcionProfesional[] = [];
  for (const trozo of aTrozos(unicos, TROZO_DE_IDS)) {
    const { data, error } = await supabase.from('directorio_perfiles').select('id, nombre_completo').in('id', trozo);
    if (error || !data) {
      console.error('cargarProfesionalesDeBonos: fallo al leer el directorio', error?.code);
      return { ok: false };
    }
    for (const p of data) {
      if (p.id !== null) opciones.push({ id: p.id, nombre: p.nombre_completo ?? t('bonos.profesionalDesconocido') });
    }
  }
  return { ok: true, opciones };
}
