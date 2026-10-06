import 'server-only';

import { connection } from 'next/server';
import { cache } from 'react';
import { z } from 'zod';

import type { RolUsuario } from '@/components/armazon/modulos';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import type { Centimos } from '@/lib/dinero/importe';
import { exigirSesion } from '@/lib/supabase/sesion';
import type { Database } from '@/lib/supabase/tipos-bd';

import { hoyEn, leerRol } from '../agenda/bloques';
import { aFilaDePendiente, importeDeBd, ordenar, type FilaDePendiente } from './presentacion';

/**
 * Lecturas de `/facturacion` (T-023 §1.4), memoizadas POR PETICIÓN con `cache()` de React.
 *
 * NUNCA `use cache` (ADR-043): es lo que ve quien mira. Guardarlo entre peticiones le serviría
 * a un profesional el pendiente de los pacientes de otro. Todo va bajo RLS: la vista
 * `pendiente_paciente` y `cobros` ya recortan por rol, y el filtro de profesional solo estrecha.
 */

type ParametrosDeBusqueda = Promise<Record<string, string | string[] | undefined>>;

export type ContextoFacturacion = {
  rol: RolUsuario | null;
  /** El profesional que filtra, solo para el administrador; null es «todos». */
  profesionalFiltrado: string | null;
  zona: string;
  hoy: string;
};

export type PendienteConNombre = FilaDePendiente & { nombre: string; apellidos: string };

export type CobroReciente = {
  id: string;
  pacienteId: string;
  nombre: string;
  apellidos: string;
  importe: Centimos;
  fecha: string;
  formaPago: Database['public']['Enums']['forma_pago'];
  referencia: string | null;
  motivo: string | null;
};

export type OpcionProfesional = { id: string; nombre: string };
export type PacienteParaCobro = { id: string; nombre: string; apellidos: string };

const cargarSesion = cache(exigirSesion);

const esquemaFiltro = z.uuid();

/**
 * Rol, filtro, zona y reloj. El rol lo decide la base (`estado_de_cuenta()`), con la lista
 * blanca de `leerRol`. El `?profesional` **solo se mira** si quien pide es administrador; para
 * cualquier otro se ignora sin leerlo, y aunque se colara, la RLS seguiría recortando.
 */
export const cargarContexto = cache(async (searchParams: ParametrosDeBusqueda): Promise<ContextoFacturacion> => {
  await connection();
  const sesion = await cargarSesion();
  const rol = leerRol((await estadoDeCuenta(sesion))?.rol);

  let profesionalFiltrado: string | null = null;
  if (rol === 'administrador') {
    const valor = (await searchParams).profesional;
    const filtro = esquemaFiltro.safeParse(valor);
    profesionalFiltrado = filtro.success ? filtro.data : null;
  }

  // La zona de la organización: el pendiente es de todos los centros a la vez.
  const { data: zona, error } = await sesion.supabase.rpc('zona_horaria_centro', {
    // El generador no modela el null que la función acepta (como en `zonaDeCentro`).
    p_centro_id: null as unknown as string,
  });
  if (error || typeof zona !== 'string' || zona.length === 0) {
    throw new Error(`Facturación: no se pudo leer la zona de la organización (${error?.code ?? 'vacía'}).`);
  }

  return { rol, profesionalFiltrado, zona, hoy: hoyEn(new Date(), zona) };
});

export type ResultadoPendientes = { ok: true; filas: PendienteConNombre[] } | { ok: false };

/**
 * Las filas de `pendiente_paciente`, contrastadas con `pendiente()` y ordenadas, con los nombres
 * leídos aparte (la vista no los lleva). Una divergencia con `pendiente()` es un error del
 * bloque: se registra y se pinta el aviso, nunca una cifra.
 */
export const cargarPendientes = cache(async (filtro: string | null): Promise<ResultadoPendientes> => {
  const { supabase } = await cargarSesion();

  let consulta = supabase
    .from('pendiente_paciente')
    .select(
      'paciente_id, profesional_id, devengado_centimos, cobrado_centimos, pendiente_centimos, excedente_centimos, estado, citas_sin_tarifa',
    );
  if (filtro) consulta = consulta.eq('profesional_id', filtro);
  const { data, error } = await consulta;
  if (error || !data) {
    console.error('cargarPendientes: fallo al leer pendiente_paciente', error?.code);
    return { ok: false };
  }

  let filas: FilaDePendiente[];
  try {
    filas = data.map(aFilaDePendiente);
  } catch (e) {
    console.error('cargarPendientes:', e instanceof Error ? e.message : e);
    return { ok: false };
  }
  if (filas.length === 0) return { ok: true, filas: [] };

  const { data: pacientes, error: errorPacientes } = await supabase
    .from('pacientes')
    .select('id, nombre, apellidos')
    .in(
      'id',
      filas.map((f) => f.pacienteId),
    );
  if (errorPacientes || !pacientes) {
    console.error('cargarPendientes: fallo al leer los nombres', errorPacientes?.code);
    return { ok: false };
  }
  const nombres = new Map(pacientes.map((p) => [p.id, p]));

  return {
    ok: true,
    filas: ordenar(
      filas.map((f) => ({
        ...f,
        nombre: nombres.get(f.pacienteId)?.nombre ?? '',
        apellidos: nombres.get(f.pacienteId)?.apellidos ?? '',
      })),
    ),
  };
});

export type ResultadoCobros = { ok: true; cobros: CobroReciente[] } | { ok: false };

/** Los 20 últimos cobros, con el importe como texto (sin coma flotante) y el nombre del paciente. */
export const cargarCobrosRecientes = cache(async (filtro: string | null): Promise<ResultadoCobros> => {
  const { supabase } = await cargarSesion();

  let consulta = supabase
    .from('cobros')
    .select(
      'id, paciente_id, importe::text, fecha, forma_pago, referencia, motivo, pacientes!inner(nombre, apellidos, profesional_id)',
    );
  if (filtro) consulta = consulta.eq('pacientes.profesional_id', filtro);
  const { data, error } = await consulta
    .order('fecha', { ascending: false })
    .order('registrado_en', { ascending: false })
    .limit(20);
  if (error || !data) {
    console.error('cargarCobrosRecientes: fallo al leer los cobros', error?.code);
    return { ok: false };
  }

  try {
    return {
      ok: true,
      cobros: data.map((c) => ({
        id: c.id,
        pacienteId: c.paciente_id,
        nombre: c.pacientes.nombre,
        apellidos: c.pacientes.apellidos,
        importe: importeDeBd(c.importe),
        fecha: c.fecha,
        formaPago: c.forma_pago,
        referencia: c.referencia,
        motivo: c.motivo,
      })),
    };
  } catch (e) {
    console.error('cargarCobrosRecientes:', e instanceof Error ? e.message : e);
    return { ok: false };
  }
});

/**
 * Solo para el administrador (lo decide `page.tsx`): los profesionales que aparecen en la vista
 * **sin filtrar**, con su nombre. Un fallo deja la lista vacía y el selector solo ofrece «todos».
 */
export const cargarOpcionesProfesional = cache(async (): Promise<OpcionProfesional[]> => {
  const { supabase } = await cargarSesion();

  const { data, error } = await supabase.from('pendiente_paciente').select('profesional_id');
  if (error || !data) {
    console.error('cargarOpcionesProfesional: fallo al leer la vista', error?.code);
    return [];
  }
  const ids = [...new Set(data.map((f) => f.profesional_id).filter((id): id is string => id !== null))];
  if (ids.length === 0) return [];

  const { data: perfiles, error: errorPerfiles } = await supabase
    .from('perfiles')
    .select('id, nombre_completo')
    .in('id', ids)
    .order('nombre_completo');
  if (errorPerfiles || !perfiles) {
    console.error('cargarOpcionesProfesional: fallo al leer los perfiles', errorPerfiles?.code);
    return [];
  }
  return perfiles.map((p) => ({ id: p.id, nombre: p.nombre_completo }));
});

/** Los pacientes a los que se puede cobrar: bajo RLS, sin fusionados, por apellidos. */
export const cargarPacientesParaCobro = cache(async (): Promise<PacienteParaCobro[]> => {
  const { supabase } = await cargarSesion();

  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nombre, apellidos')
    .is('fusionado_en', null)
    .order('apellidos');
  if (error || !data) {
    console.error('cargarPacientesParaCobro: fallo al leer los pacientes', error?.code);
    return [];
  }
  return data;
});
