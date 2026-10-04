// T-040 · La lógica de servidor de la copia cifrada de una nota (diseño §1.3).
//
// Las Server Actions (`historia/notas/acciones-copia.ts`) SOLO envuelven estas funciones:
// `exigirSesion()` → Zod → una de estas, con la forma `(sesion, entrada, contexto)` de
// `lib/notas/servidor.ts`, para que el guion `scripts/t040-exportacion.ts` las llame con una sesión
// real y sin cookies.
//
// Tres reglas:
//  1. La base decide quién exporta qué (`exportar_nota`, security definer). Aquí solo se TRADUCE
//     su error, por código Y fragmento: seis causas distintas comparten el 42501, y el candado
//     cerrado no es «sin permiso».
//  2. La respuesta pasa por `esquemaRespuestaExportar` y por `proyectar` antes de salir de aquí:
//     si la base y el código discrepan en el formato, la copia no se hace.
//  3. Registros: solo `{ code }`. Nunca el objeto de error (su `details` puede llevar datos), la
//     respuesta, la copia ni los `issues` de Zod con su `input`; de Zod, solo `path` y `code`.
import 'server-only';

import { format } from 'date-fns';
import { tz } from '@date-fns/tz';

import type { Sesion } from '@/lib/cuentas/tipos';

import type { MotivoExportacion } from './constantes';
import { esquemaRespuestaExportar, proyectar, type CopiaV1 } from './formato';

export type Contexto = { ip: string | null; agente: string | null };

export type MotivoFalloCopia = 'bloqueada' | 'sin_permiso' | 'falta_motivo' | 'sin_versiones' | 'error';

export type ResultadoCopia =
  | { ok: true; exportacionId: string; copia: CopiaV1; nombreFichero: string }
  | { ok: false; motivo: MotivoFalloCopia };

export type ResultadoRegistroFichero = { ok: true } | { ok: false; motivo: 'caducada' | 'error' };

export type Leida<T> = { ok: true; valor: T } | { ok: false };

/** Una nota que el administrador no lee pero de la que puede pedir copia por motivo (P2-a). */
export type NotaParaCopia = {
  id: string;
  /** «dd/MM/yyyy». */
  fechaSesion: string;
  autor: string;
  versiones: number;
  href: string;
};

type ErrorBase = { code?: string; message?: string } | null;

/** Los fragmentos son los literales de `20261009180000_exportaciones.sql`; el banco 27 fija cada uno. */
function motivoDeExportar(error: NonNullable<ErrorBase>): MotivoFalloCopia {
  const mensaje = error.message ?? '';
  if (error.code === '42501') {
    if (mensaje.includes('no está desbloqueada')) return 'bloqueada';
    if (mensaje.includes('Falta el motivo')) return 'falta_motivo';
    return 'sin_permiso';
  }
  if (error.code === '22023' && mensaje.includes('no tiene versiones firmadas')) return 'sin_versiones';
  return 'error';
}

/** «copia-de-nota-AAAAMMDD-HHmm.html», en la zona de la copia. Sin nombre, id ni fecha de sesión. */
function nombreDelFichero(generadaEn: string, zona: string): string {
  return `copia-de-nota-${format(new Date(generadaEn), 'yyyyMMdd-HHmm', { in: tz(zona) })}.html`;
}

/** «AAAA-MM-DD» → «dd/MM/yyyy», sin pasar por un `Date` (una fecha de calendario no tiene zona). */
function fechaLegible(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

export async function pedirCopiaDeNota(
  sesion: Sesion,
  entrada: {
    pacienteId: string;
    notaId: string;
    motivo: MotivoExportacion | null;
    referencia: string | null;
  },
  contexto: Contexto,
): Promise<ResultadoCopia> {
  const { data, error } = await sesion.supabase.rpc('exportar_nota', {
    p_paciente_id: entrada.pacienteId,
    p_nota_id: entrada.notaId,
    // Los nulos no se mandan: la función los tiene por defecto (`null`), y el tipo generado no
    // admite `null` explícito en los opcionales.
    ...(entrada.motivo !== null ? { p_motivo: entrada.motivo } : {}),
    ...(entrada.referencia !== null ? { p_referencia: entrada.referencia } : {}),
    ...(contexto.ip !== null ? { p_ip: contexto.ip } : {}),
    ...(contexto.agente !== null ? { p_agente: contexto.agente } : {}),
  });
  if (error) {
    console.error('exportaciones: exportar_nota falló', { code: error.code });
    return { ok: false, motivo: motivoDeExportar(error) };
  }

  const leida = esquemaRespuestaExportar.safeParse(data);
  if (!leida.success) {
    console.error('exportaciones: la respuesta no cumple el contrato', {
      problemas: leida.error.issues.map((p) => ({ path: p.path.map(String), code: p.code })),
    });
    return { ok: false, motivo: 'error' };
  }

  const respuesta = leida.data;
  return {
    ok: true,
    exportacionId: respuesta.exportacion_id,
    copia: proyectar(respuesta),
    nombreFichero: nombreDelFichero(respuesta.generada_en, respuesta.zona),
  };
}

export async function registrarFichero(
  sesion: Sesion,
  entrada: { exportacionId: string; huellaHex: string },
): Promise<ResultadoRegistroFichero> {
  const { error } = await sesion.supabase.rpc('registrar_fichero_exportado', {
    p_exportacion_id: entrada.exportacionId,
    p_huella_hex: entrada.huellaHex,
  });
  if (error) {
    console.error('exportaciones: registrar_fichero_exportado falló', { code: error.code });
    const caducada = error.code === '42501' && (error.message ?? '').includes('no es tuya o ha caducado');
    return { ok: false, motivo: caducada ? 'caducada' : 'error' };
  }
  return { ok: true };
}

/**
 * Las notas del paciente que quien llama NO lee pero de las que puede pedir copia por motivo. La
 * base decide (administrador no asignado, candado abierto, nota fuera de su lectura); aquí solo se
 * da forma. No registra acceso: la llama `abrirPestanaDeHistoria` DESPUÉS de registrar. Un fallo es
 * `{ ok: false }`, nunca una lista vacía.
 */
export async function notasParaCopia(sesion: Sesion, pacienteId: string): Promise<Leida<NotaParaCopia[]>> {
  const { data, error } = await sesion.supabase.rpc('notas_para_copia', { p_paciente_id: pacienteId });
  if (error) {
    console.error('exportaciones: notas_para_copia falló', { code: error.code });
    return { ok: false };
  }
  return {
    ok: true,
    valor: (data ?? []).map((f) => ({
      id: f.nota_id,
      fechaSesion: fechaLegible(f.fecha_sesion),
      autor: f.autor_nombre,
      versiones: f.versiones,
      // Siempre `?nota=`: `?cita=` es la puerta de CREACIÓN de la agenda.
      href: `/pacientes/${pacienteId}/historia/notas?nota=${f.nota_id}`,
    })),
  };
}
