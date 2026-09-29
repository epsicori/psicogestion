/**
 * La cuenta del arrastre de una cita en la semana (T-014 D4), sin DOM y sin `Date`: recibe
 * coordenadas de pantalla y devuelve una columna y un minuto de pared. Aparte de la isla para
 * poder probarla sin layout (jsdom no lo tiene).
 */

/** Píxeles por minuto: una hora son 96 px. */
export const PX_MIN = 96 / 60;

/** Los saltos del ajuste: cuartos de hora. */
const CUARTO = 15;

type Entrada = {
  /** Posición del puntero. */
  x: number;
  y: number;
  /** Cuántos píxeles por debajo del borde superior de la cita se agarró. */
  yAgarre: number;
  /** El cuerpo de la rejilla (bajo las cabeceras de día). */
  caja: { left: number; top: number; width: number };
  desdeMinuto: number;
  hastaMinuto: number;
  columnas: number;
};

export function destinoDeArrastre(e: Entrada): { columna: number; minuto: number } {
  const ancho = e.caja.width / e.columnas;
  const columna = Math.min(e.columnas - 1, Math.max(0, Math.floor((e.x - e.caja.left) / ancho)));

  const bruto = e.desdeMinuto + (e.y - e.yAgarre - e.caja.top) / PX_MIN;
  const ajustado = Math.round(bruto / CUARTO) * CUARTO;
  const minuto = Math.min(e.hastaMinuto - CUARTO, Math.max(e.desdeMinuto, ajustado));

  return { columna, minuto };
}

/** `HH:MM` de un minuto de pared, con aritmética de enteros. */
export function horaDeMinuto(minuto: number): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(Math.floor(minuto / 60))}:${dos(minuto % 60)}`;
}
