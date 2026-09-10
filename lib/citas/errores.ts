import type { PostgrestError } from '@supabase/supabase-js';

import type { MotivoErrorCitas } from './tipos';

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
    case 'desconocido':
    default:
      return 'No se pudo completar la operación.';
  }
}
