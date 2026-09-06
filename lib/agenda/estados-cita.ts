// Estados de la cita y su tabla de transiciones — módulo puro (ADR-045).
// Esta regla se escribe UNA vez aquí: T-010 la anclará en la base de datos y
// T-014 pintará contra ella. Si T-010 decide otra cosa, manda T-010 y este
// fichero se reescribe.
//
// Sin reloj propio, sin base de datos, sin React: `ahora` llega siempre como
// parámetro porque se calcula en servidor, en la zona del centro.

import { estaEnCurso as estaDentroDelIntervalo } from '../fechas/intervalos';

/**
 * Los cinco valores de `citas.estado`, EN EL ORDEN en que se declararán en el
 * enum de Postgres: ese orden es el contrato con T-010. Añadir un valor al
 * enum es una migración; quitarlo no existe.
 */
export const ESTADOS_CITA = Object.freeze([
  'programada',
  'confirmada',
  'realizada',
  'cancelada',
  'no_asistida',
] as const);

export type EstadoCita = (typeof ESTADOS_CITA)[number];

/**
 * Lo que la interfaz pinta: los cinco estados guardados más dos calculados.
 * `en_curso` NO es un estado persistido (ADR-045): se calcula con el reloj.
 * `pasada_sin_marcar` tampoco: es la cita que ya terminó y sigue `programada`
 * o `confirmada`, la que dispara el deber de documentación.
 *
 * Este tipo derivado NUNCA se guarda en la base de datos. Persistirlo
 * desincronizaría la fila con el reloj: el valor correcto cambia solo.
 */
export type EstadoVisibleCita = EstadoCita | 'en_curso' | 'pasada_sin_marcar';

/**
 * Tabla de transiciones como dato, no como `switch`. Corregir un error es
 * OTRA cita, nunca un viaje de vuelta: por eso `realizada`, `cancelada` y
 * `no_asistida` son terminales y no salen a ningún sitio.
 */
const TRANSICIONES: Readonly<Record<EstadoCita, readonly EstadoCita[]>> = Object.freeze({
  programada: Object.freeze(['confirmada', 'realizada', 'cancelada', 'no_asistida'] as const),
  confirmada: Object.freeze(['realizada', 'cancelada', 'no_asistida'] as const),
  realizada: Object.freeze([] as const),
  cancelada: Object.freeze([] as const),
  no_asistida: Object.freeze([] as const),
});

/** Verdadero si la transición `desde → hasta` es legal. Nunca a sí mismo. */
export function puedeTransitar(desde: EstadoCita, hasta: EstadoCita): boolean {
  return TRANSICIONES[desde].includes(hasta);
}

/**
 * Estados destino permitidos desde `estado`. Es lo que T-014 usará para
 * pintar el menú de la cita sin repetir la regla.
 */
export function transicionesDesde(estado: EstadoCita): readonly EstadoCita[] {
  return TRANSICIONES[estado];
}

/** Mínimo que esta regla necesita de una cita. La forma de la fila es de T-010. */
export interface CitaParaEstado {
  inicio: Date;
  fin: Date;
  estado: EstadoCita;
}

/**
 * Regla completa del ADR-045: el instante cae en `[inicio, fin)` Y el estado
 * no es `cancelada` ni `no_asistida`. La mitad de reloj la resuelve
 * `lib/fechas/`; aquí solo se añade la mitad de estado.
 */
export function estaEnCurso(cita: CitaParaEstado, ahora: Date): boolean {
  if (cita.estado === 'cancelada' || cita.estado === 'no_asistida') {
    return false;
  }
  return estaDentroDelIntervalo(cita.inicio, cita.fin, ahora);
}

/**
 * Lo que la interfaz pinta para una cita en el instante `ahora`. Devuelve el
 * estado guardado salvo los dos calculados: `en_curso` si la regla del ADR-045
 * lo dice, y `pasada_sin_marcar` si ya terminó y sigue `programada` o
 * `confirmada`.
 */
export function estadoVisible(cita: CitaParaEstado, ahora: Date): EstadoVisibleCita {
  if (estaEnCurso(cita, ahora)) {
    return 'en_curso';
  }
  if (
    (cita.estado === 'programada' || cita.estado === 'confirmada') &&
    ahora >= cita.fin
  ) {
    return 'pasada_sin_marcar';
  }
  return cita.estado;
}

/**
 * Claves de i18n, no cadenas: cada estado visible expone su clave para el
 * catálogo de T-009. Ningún texto en castellano vive en este módulo, y el
 * color tampoco: el color es token y lo decide T-007.
 */
export const CLAVES_ESTADO_CITA: Readonly<Record<EstadoVisibleCita, string>> = Object.freeze({
  programada: 'agenda.estado.programada',
  confirmada: 'agenda.estado.confirmada',
  realizada: 'agenda.estado.realizada',
  cancelada: 'agenda.estado.cancelada',
  no_asistida: 'agenda.estado.no_asistida',
  en_curso: 'agenda.estado.en_curso',
  pasada_sin_marcar: 'agenda.estado.pasada_sin_marcar',
});

/** Clave de i18n de un estado guardado (sin calcular el visible). */
export function claveDeEstado(estado: EstadoCita): string {
  return CLAVES_ESTADO_CITA[estado];
}
