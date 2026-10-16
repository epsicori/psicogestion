import 'server-only';

import { connection } from 'next/server';
import { cache } from 'react';
import { z } from 'zod';

import type { RolUsuario } from '@/components/armazon/modulos';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import type { Centimos } from '@/lib/dinero/importe';
import { FICHAS } from '@/lib/facturacion/registro';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';
import type { Database } from '@/lib/supabase/tipos-bd';

import { hoyEn, leerRol } from '../agenda/bloques';
import { FORMAS_DE_PAGO } from './esquemas';
import { leerFiltrosFacturas, type FiltrosFacturas } from './filtros-facturas';
import { aFilaDePendiente, importeDeBd, type FilaDePendiente } from './presentacion';

/**
 * Lecturas de `/facturacion` (T-023 §1.4), memoizadas POR PETICIÓN con `cache()` de React.
 *
 * NUNCA `use cache` (ADR-043): es lo que ve quien mira. Guardarlo entre peticiones le serviría
 * a un profesional el pendiente de los pacientes de otro. Todo va bajo RLS: la vista
 * `pendiente_paciente` y `cobros` ya recortan por rol, y el filtro de profesional solo estrecha.
 *
 * `max_rows` de PostgREST es 1000 (`supabase/config.toml`): ninguna lectura de aquí puede pasar
 * de ese tope en silencio. Las cifras salen de la base (`resumen_pendiente`), la lista se pide
 * de 50 en 50 y los pacientes del formulario, de 1000 en 1000 hasta agotarlos.
 */

type ParametrosDeBusqueda = Promise<Record<string, string | string[] | undefined>>;

/** Filas de la lista del pendiente por página. */
export const TAMANO_PAGINA = 50;

/** Filas de la lista de facturas por página (T-023b). */
export const TAMANO_PAGINA_FACTURAS = 20;

/** Filas por página al leer los pacientes del formulario: el tope de `max_rows`. */
const TAMANO_LOTE_PACIENTES = 1000;

export type ContextoFacturacion = {
  rol: RolUsuario | null;
  /** El profesional que filtra, solo para el administrador; null es «todos». */
  profesionalFiltrado: string | null;
  /** Página pedida de la lista del pendiente (1 si `?pagina` no valida). La leen todos los roles. */
  pagina: number;
  zona: string;
  hoy: string;
  /** Los filtros de la lista de facturas (T-023b); la leen todos los roles, la base recorta por rol. */
  filtrosFacturas: FiltrosFacturas;
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
const esquemaPagina = z.coerce.number().int().min(1);

/**
 * Rol, filtro, página, zona y reloj. El rol lo decide la base (`estado_de_cuenta()`), con la
 * lista blanca de `leerRol`. El `?profesional` **solo se mira** si quien pide es administrador;
 * para cualquier otro se ignora sin leerlo, y aunque se colara, la RLS seguiría recortando. El
 * `?pagina` se lee para todos: solo pagina lo que la vista ya deja ver.
 */
export const cargarContexto = cache(async (searchParams: ParametrosDeBusqueda): Promise<ContextoFacturacion> => {
  await connection();
  const sesion = await cargarSesion();
  const rol = leerRol((await estadoDeCuenta(sesion))?.rol);

  const parametros = await searchParams;
  let profesionalFiltrado: string | null = null;
  if (rol === 'administrador') {
    const filtro = esquemaFiltro.safeParse(parametros.profesional);
    profesionalFiltrado = filtro.success ? filtro.data : null;
  }
  const numeroPagina = esquemaPagina.safeParse(parametros.pagina);
  const pagina = numeroPagina.success ? numeroPagina.data : 1;

  // La zona de la organización: el pendiente es de todos los centros a la vez.
  const { data: zona, error } = await sesion.supabase.rpc('zona_horaria_centro', {
    // El generador no modela el null que la función acepta (como en `zonaDeCentro`).
    p_centro_id: null as unknown as string,
  });
  if (error || typeof zona !== 'string' || zona.length === 0) {
    throw new Error(`Facturación: no se pudo leer la zona de la organización (${error?.code ?? 'vacía'}).`);
  }

  const hoy = hoyEn(new Date(), zona);
  return { rol, profesionalFiltrado, pagina, zona, hoy, filtrosFacturas: leerFiltrosFacturas(parametros, hoy) };
});

export type ResumenPendiente = {
  pendienteTotal: Centimos;
  conPendiente: number;
  deMas: number;
  /** Pacientes con fila en la vista (los que ve quien pide, con el filtro aplicado). */
  filas: number;
};
export type ResultadoResumen = { ok: true; resumen: ResumenPendiente } | { ok: false };

const esEnteroNoNegativo = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0;

/**
 * Las cifras exactas del pendiente, de `resumen_pendiente()`: las calcula la base sobre TODAS las
 * filas que ve quien pide, sin el tope de `max_rows`. Espera una sola fila con enteros seguros;
 * cualquier otra cosa es un error del bloque, nunca una cifra.
 */
export const cargarResumen = cache(async (filtro: string | null): Promise<ResultadoResumen> => {
  const { supabase } = await cargarSesion();

  const { data, error } = await supabase.rpc('resumen_pendiente', filtro ? { p_profesional_id: filtro } : {});
  if (error || !data) {
    console.error('cargarResumen: fallo al leer resumen_pendiente', error?.code);
    return { ok: false };
  }
  if (data.length !== 1) {
    console.error('cargarResumen: resumen_pendiente no devolvió exactamente una fila');
    return { ok: false };
  }
  const [fila] = data;
  const numeros = [
    fila.pendiente_total_centimos,
    fila.pacientes_con_pendiente,
    fila.pacientes_cobrado_de_mas,
    fila.filas,
  ];
  if (!numeros.every(esEnteroNoNegativo)) {
    console.error('cargarResumen: resumen_pendiente devolvió un número que no es un entero seguro');
    return { ok: false };
  }

  return {
    ok: true,
    resumen: {
      pendienteTotal: fila.pendiente_total_centimos,
      conPendiente: fila.pacientes_con_pendiente,
      deMas: fila.pacientes_cobrado_de_mas,
      filas: fila.filas,
    },
  };
});

export type ResultadoPendientes = { ok: true; filas: PendienteConNombre[] } | { ok: false };

/**
 * Una página de `pendiente_paciente`, contrastada con `pendiente()`, con los nombres leídos aparte
 * (la vista no los lleva). El orden y el corte los hace la base: primero lo cobrado de más por
 * excedente, luego lo pendiente de mayor a menor y al final lo cobrado; el desempate por id lo
 * hace estable entre páginas. Una divergencia con `pendiente()` es un error del bloque: se
 * registra y se pinta el aviso, nunca una cifra.
 */
export const cargarPendientes = cache(async (filtro: string | null, pagina: number): Promise<ResultadoPendientes> => {
  const { supabase } = await cargarSesion();

  let consulta = supabase
    .from('pendiente_paciente')
    .select(
      'paciente_id, profesional_id, devengado_centimos, cobrado_centimos, pendiente_centimos, excedente_centimos, estado, citas_sin_tarifa',
    );
  if (filtro) consulta = consulta.eq('profesional_id', filtro);
  const { data, error } = await consulta
    .order('excedente_centimos', { ascending: false })
    .order('pendiente_centimos', { ascending: false })
    .order('paciente_id')
    .range((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA - 1);
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

  // A lo sumo TAMANO_PAGINA ids: cabe en la URL de PostgREST y en `max_rows`.
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
    filas: filas.map((f) => ({
      ...f,
      nombre: nombres.get(f.pacienteId)?.nombre ?? '',
      apellidos: nombres.get(f.pacienteId)?.apellidos ?? '',
    })),
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
 * Solo para el administrador (lo decide `page.tsx`): los profesionales con alguna fila visible en
 * la vista **sin filtrar**, con su nombre, de `profesionales_del_pendiente()`. El nombre sale del
 * directorio (`directorio_perfiles`) porque `perfiles` solo enseña al administrador su propia fila.
 *
 * El profesional elegido va siempre entre las opciones, aunque la vista ya no lo traiga (una URL
 * escrita a mano): se lee del directorio, o se rotula «Profesional no encontrado» (solo sin fila y sin error). Un
 * fallo de la función o del directorio es `{ ok: false }`: la pantalla avisa en lugar de ofrecer
 * un selector con «todos» que parecería completo.
 */
export type ResultadoOpcionesProfesional = { ok: true; opciones: OpcionProfesional[] } | { ok: false };

export const cargarOpcionesProfesional = cache(async (elegido: string | null): Promise<ResultadoOpcionesProfesional> => {
  const { supabase } = await cargarSesion();

  const { data, error } = await supabase.rpc('profesionales_del_pendiente');
  if (error || !data) {
    console.error('cargarOpcionesProfesional: fallo al leer los profesionales', error?.code);
    return { ok: false };
  }
  const opciones = data.map((p) => ({ id: p.id, nombre: p.nombre_completo }));
  if (elegido === null || opciones.some((o) => o.id === elegido)) return { ok: true, opciones };

  const { data: perfil, error: errorPerfil } = await supabase
    .from('directorio_perfiles')
    .select('id, nombre_completo')
    .eq('id', elegido)
    .maybeSingle();
  if (errorPerfil) {
    console.error('cargarOpcionesProfesional: fallo al leer el directorio', errorPerfil.code);
    return { ok: false };
  }
  return {
    ok: true,
    opciones: [{ id: elegido, nombre: perfil?.nombre_completo ?? t('cobros.profesionalDesconocido') }, ...opciones],
  };
});

export type ResultadoPacientesParaCobro = { ok: true; pacientes: PacienteParaCobro[] } | { ok: false };

/**
 * Los pacientes a los que se puede cobrar: bajo RLS, sin fusionados (el cobro va al superviviente),
 * por apellidos. Se leen de 1000 en 1000 (`max_rows`) hasta que una página viene corta, con el id
 * como último desempate para que no se repita ni se pierda ninguno entre páginas. Un error en
 * cualquier página es un error del bloque: nunca una lista a medias.
 */
export const cargarPacientesParaCobro = cache(async (): Promise<ResultadoPacientesParaCobro> => {
  const { supabase } = await cargarSesion();

  const porId = new Map<string, PacienteParaCobro>();
  for (let desde = 0; ; desde += TAMANO_LOTE_PACIENTES) {
    const { data, error } = await supabase
      .from('pacientes')
      .select('id, nombre, apellidos')
      .is('fusionado_en', null)
      .order('apellidos')
      .order('nombre')
      .order('id')
      .range(desde, desde + TAMANO_LOTE_PACIENTES - 1);
    if (error || !data) {
      console.error('cargarPacientesParaCobro: fallo al leer los pacientes', error?.code);
      return { ok: false };
    }
    for (const p of data) if (!porId.has(p.id)) porId.set(p.id, p);
    if (data.length < TAMANO_LOTE_PACIENTES) break;
  }
  return { ok: true, pacientes: [...porId.values()] };
});

export type CobroDeFactura = {
  id: string;
  /** Con signo: una devolución es negativa. */
  importeCentimos: number;
  fecha: string;
  formaPago: Database['public']['Enums']['forma_pago'];
  referencia: string | null;
  motivo: string | null;
};

export type FacturaListada = {
  id: string;
  pacienteId: string;
  nombre: string;
  apellidos: string;
  /** El paciente se unió a otro registro: la factura se ve, pero no admite cobros nuevos (ADR-031). */
  fusionado: boolean;
  /** El nombre del programa que la expidió, para la frase «Emitida en {programa}». */
  programa: string;
  numero: string;
  fecha: string;
  totalCentimos: Centimos;
  /** Enlace al documento en el programa; null si no es un https válido (nunca se pinta un enlace dudoso). */
  url: string | null;
  cobros: CobroDeFactura[];
  /** Cobros del paciente que no están en ninguna factura: lo que se podría asignar. */
  cobrosSinFactura: number;
};

export type ResultadoFacturas =
  | { ok: true; facturas: FacturaListada[]; total: number; pagina: number }
  | { ok: false };

const esquemaFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const esquemaCobroDeFactura = z.object({
  cobro_id: z.uuid(),
  importe_centimos: z.number().int().refine((n) => n !== 0),
  fecha: esquemaFecha,
  forma_pago: z.enum(FORMAS_DE_PAGO),
  referencia: z.string().nullable(),
  motivo: z.string().nullable(),
});
const esquemaFilaDeFactura = z.object({
  id: z.uuid(),
  paciente_id: z.uuid(),
  paciente_nombre: z.string().nullable(),
  paciente_apellidos: z.string().nullable(),
  paciente_fusionado: z.boolean(),
  proveedor: z.string(),
  numero: z.string(),
  fecha_expedicion: esquemaFecha,
  total_centimos: z.number().int().min(0),
  url_proveedor: z.string().nullable(),
  cobros: z.array(esquemaCobroDeFactura),
  cobros_sin_factura: z.number().int().min(0),
  total_filas: z.number().int().min(0),
});

const esUrlHttps = (valor: string | null): valor is string => {
  if (!valor) return false;
  try {
    return new URL(valor).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Una página de las facturas del espejo, de `listado_facturas_espejo()` (T-023b): el filtro, el orden, el corte
 * y los cobros de cada factura (leídos de `cobros_por_factura`) los hace la base, bajo la RLS de quien pide.
 * Aquí solo se cablea y se valida: una fila con forma rara es un error del bloque, nunca una cifra.
 * Una página que pasa de la última cae en la última (se averigua el total con la primera).
 * El `profesional` solo llega para el administrador (lo decide `cargarContexto`).
 */
export const cargarFacturas = cache(
  async (filtros: FiltrosFacturas, profesional: string | null): Promise<ResultadoFacturas> => {
    const { supabase } = await cargarSesion();

    async function pedir(pagina: number) {
      const { data, error } = await supabase.rpc('listado_facturas_espejo', {
        p_desde: filtros.desde,
        p_hasta: filtros.hasta,
        ...(filtros.formaPago ? { p_forma_pago: filtros.formaPago } : {}),
        ...(profesional ? { p_profesional_id: profesional } : {}),
        p_limite: TAMANO_PAGINA_FACTURAS,
        p_desplazamiento: (pagina - 1) * TAMANO_PAGINA_FACTURAS,
      });
      if (error || !data) {
        console.error('cargarFacturas: fallo al leer listado_facturas_espejo', error?.code);
        return null;
      }
      return data;
    }

    let pagina = filtros.pagina;
    let filas = await pedir(pagina);
    if (filas === null) return { ok: false };
    if (filas.length === 0 && pagina > 1) {
      const primera = await pedir(1);
      if (primera === null) return { ok: false };
      const total = primera[0]?.total_filas ?? 0;
      if (total === 0) return { ok: true, facturas: [], total: 0, pagina: 1 };
      pagina = Math.ceil(total / TAMANO_PAGINA_FACTURAS);
      filas = pagina === 1 ? primera : await pedir(pagina);
      if (filas === null) return { ok: false };
    }
    if (filas.length === 0) return { ok: true, facturas: [], total: 0, pagina };

    const validas = z.array(esquemaFilaDeFactura).safeParse(filas);
    if (!validas.success) {
      console.error('cargarFacturas: forma inesperada en listado_facturas_espejo');
      return { ok: false };
    }
    return {
      ok: true,
      total: validas.data[0].total_filas,
      pagina,
      facturas: validas.data.map((f) => ({
        id: f.id,
        pacienteId: f.paciente_id,
        nombre: f.paciente_nombre ?? '',
        apellidos: f.paciente_apellidos ?? '',
        fusionado: f.paciente_fusionado,
        programa: FICHAS[f.proveedor as keyof typeof FICHAS]?.nombre ?? t('facturacion.panel.programaGenerico'),
        numero: f.numero,
        fecha: f.fecha_expedicion,
        totalCentimos: f.total_centimos as Centimos,
        url: esUrlHttps(f.url_proveedor) ? f.url_proveedor : null,
        cobros: f.cobros.map((c) => ({
          id: c.cobro_id,
          importeCentimos: c.importe_centimos,
          fecha: c.fecha,
          formaPago: c.forma_pago,
          referencia: c.referencia,
          motivo: c.motivo,
        })),
        cobrosSinFactura: f.cobros_sin_factura,
      })),
    };
  },
);
