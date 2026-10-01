import type { PostgrestError } from '@supabase/supabase-js';

import type { DetalleRechazo, MotivoErrorCitas } from './tipos';

/**
 * El mapa de errores único del §8 del diseño de T-011. `42501` no distingue
 * en el código entre «no es tuya» y «está pasada»: la única pista es el
 * texto del mensaje que pone `fn_proteger_cita_pasada()` («cita pasada»).
 * Si ese texto cambia en la migración, este mapeo hay que revisarlo junto a
 * ella — están escritos a propósito con las mismas palabras.
 */
export function mapearErrorCitas(error: PostgrestError): MotivoErrorCitas {
  switch (error.code) {
    case '23P01':
      return 'hueco_ocupado';
    case '42501':
      return error.message.toLowerCase().includes('pasada') ? 'cita_pasada' : 'no_autorizado';
    case '22023':
      return 'parametro_invalido';
    default:
      return 'desconocido';
  }
}

/** Mensaje en castellano, literal, para cada motivo — `lib/citas/` no importa `lib/i18n/`. */
export function mensajeParaMotivo(motivo: MotivoErrorCitas): string {
  switch (motivo) {
    case 'hueco_ocupado':
      return 'Ese hueco ya está ocupado.';
    case 'no_autorizado':
      return 'No tienes autorización para esta operación.';
    case 'cita_pasada':
      return 'Una cita pasada no se puede tocar: es historia, no planificación.';
    case 'parametro_invalido':
      return 'Los datos enviados no son válidos.';
    case 'destino_pasado':
      return 'No se puede mover una cita a un momento que ya ha pasado.';
    case 'previsualizacion_caducada':
      return 'La serie cambió mientras la mirabas; revisa el cambio y vuelve a mover.';
    case 'desconocido':
    default:
      return 'No se pudo completar la operación.';
  }
}

/**
 * Fragmentos literales de los `raise exception ... errcode = '22023'` de la
 * migración de T-011b (`20260925120000_editar_serie_desde_la_cita.sql`, §3 de
 * su diseño), en el orden de la tabla de §8.5 del diseño de T-014. Se
 * escribieron a la vez que esa migración, igual que «pasada» en `42501`: si
 * un texto cambia allí, cambia aquí, y `errores.test.ts` lo comprueba leyendo
 * la migración. `Con "esta"` no está a propósito: es un error de
 * programación y se queda en el genérico.
 */
export const FRAGMENTOS_DE_RECHAZO: readonly (readonly [string, DetalleRechazo])[] = [
  ['ya ha empezado o ha pasado', 'yaEmpezada'],
  ['cancelada o cerrada', 'canceladaOCerrada'],
  ['se movió a mano', 'movidaAMano'],
  ['no coinciden', 'fechaYDiaNoCoinciden'],
  ['nuevo horario de esta cita ya ha pasado', 'horarioNuevoPasado'],
  ['quedado en el pasado', 'propuestaPasada'],
  ['sin evento', 'sinEvento'],
  ['otra regla', 'otraRegla'],
  ['otra zona', 'otraZona'],
  ['La cita cambió', 'citaCambiada'],
  ['no tiene horario', 'sinHorario'],
];

/** El detalle de un rechazo `22023` de la base, o `null` si no es uno de los conocidos. */
export function detalleDeRechazo(error: PostgrestError): DetalleRechazo | null {
  if (error.code !== '22023') return null;
  const encontrado = FRAGMENTOS_DE_RECHAZO.find(([fragmento]) => error.message.includes(fragmento));
  return encontrado ? encontrado[1] : null;
}

/**
 * El fallo completo de un error de PostgREST: motivo, su mensaje y, si la base
 * dijo por qué, el `detalle`. Sin detalle la clave no aparece.
 */
export function resultadoDeError(error: PostgrestError): {
  ok: false;
  motivo: MotivoErrorCitas;
  mensaje: string;
  detalle?: DetalleRechazo;
} {
  const motivo = mapearErrorCitas(error);
  const detalle = detalleDeRechazo(error);
  return detalle
    ? { ok: false, motivo, detalle, mensaje: mensajeParaMotivo(motivo) }
    : { ok: false, motivo, mensaje: mensajeParaMotivo(motivo) };
}
