// Aritmética de fechas de calendario `AAAA-MM-DD`: sin zona, sin horas y sin
// reloj. Un día de calendario no es un instante, así que se opera en UTC puro
// (un `Date.UTC` a medianoche) y nunca hay cambio de hora de por medio.
const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 86_400_000;

function partes(fecha: string): { anio: number; mes: number; dia: number } | null {
  const m = PATRON_FECHA.exec(fecha);
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  // `Date.UTC` normaliza en silencio el 30 de febrero al 2 de marzo: se
  // comprueba con un viaje de ida y vuelta (igual que `relativo.ts`).
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return { anio, mes, dia };
}

function exigir(fecha: string): { anio: number; mes: number; dia: number } {
  const p = partes(fecha);
  if (!p) throw new Error(`Fecha de calendario inválida: '${fecha}' (se espera AAAA-MM-DD).`);
  return p;
}

function aCadena(ms: number): string {
  const d = new Date(ms);
  const anio = String(d.getUTCFullYear()).padStart(4, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function aMs(fecha: string): number {
  const { anio, mes, dia } = exigir(fecha);
  return Date.UTC(anio, mes - 1, dia);
}

/** `'2026-02-30'` → `false`. Formato `AAAA-MM-DD` y día que existe. */
export function esFechaDeCalendario(fecha: string): boolean {
  return partes(fecha) !== null;
}

/** Suma `n` días de calendario (negativo resta). */
export function sumarDias(fecha: string, n: number): string {
  return aCadena(aMs(fecha) + n * MS_DIA);
}

/** Suma `n` meses; si el día no existe en el mes de destino, recorta al último. */
export function sumarMeses(fecha: string, n: number): string {
  const { anio, mes, dia } = exigir(fecha);
  const indice = anio * 12 + (mes - 1) + n;
  const anioDestino = Math.floor(indice / 12);
  const mesDestino = indice - anioDestino * 12; // 0-11
  const ultimo = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate();
  return aCadena(Date.UTC(anioDestino, mesDestino, Math.min(dia, ultimo)));
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aMs(hasta) - aMs(desde)) / MS_DIA);
}

/** Día de la semana ISO: lunes 1 … domingo 7. */
export function diaDeLaSemana(fecha: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const dia = new Date(aMs(fecha)).getUTCDay(); // 0 domingo
  return (dia === 0 ? 7 : dia) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}
