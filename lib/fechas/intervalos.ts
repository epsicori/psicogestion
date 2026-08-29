// Duración, solape y «en curso» sobre intervalos de instantes. Sin estados,
// sin cita, sin base de datos: solo aritmética de intervalos.
//
// Convención: todo intervalo es SEMIABIERTO, [inicio, fin). El instante `fin`
// ya no pertenece al intervalo, así que dos citas consecutivas 10:00-10:50 y
// 10:50-11:40 NO se solapan. La restricción de exclusión de T-010 heredará
// esta misma convención.

export interface Intervalo {
  inicio: Date;
  fin: Date;
}

const MILISEGUNDOS_POR_MINUTO = 60_000;

/** Minutos entre dos instantes. Negativa si `fin` va antes que `inicio`. */
export function duracionEnMinutos(inicio: Date, fin: Date): number {
  return (fin.getTime() - inicio.getTime()) / MILISEGUNDOS_POR_MINUTO;
}

/** Solape con intervalos semiabiertos: comparten al menos un instante. */
export function seSolapan(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fin && b.inicio < a.fin;
}

/**
 * Mitad de reloj del ADR-045: `ahora` llega como parámetro porque se calcula
 * en servidor, nunca con el reloj del navegador. Qué estados anulan
 * «en curso» lo decide T-020.
 */
export function estaEnCurso(inicio: Date, fin: Date, ahora: Date): boolean {
  return inicio <= ahora && ahora < fin;
}
