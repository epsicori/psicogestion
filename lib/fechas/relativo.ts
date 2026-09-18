// Fechas de calendario SIN hora: un `date` de Postgres ('2026-05-01') no es
// un instante, es un día. Para formatearlo hay que anclarlo a un instante
// concreto de ese día en la zona del centro, y ese instante es el MEDIODÍA:
// los saltos de horario caen de madrugada, así que a las 12:00 no hay hora
// inexistente ni ambigua en ninguna zona, y el día que entra es el que sale.
import { TZDate } from '@date-fns/tz';

import { formatearFechaCorta } from './formato';

const PATRON_FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `'2026-05-01'` → `'01/05/2026'`. El día se ancla a las 12:00 en `zona`. */
export function formatearFechaSinZona(fechaIso: string, zona: string): string {
  const partes = PATRON_FECHA_ISO.exec(fechaIso);
  if (!partes) {
    throw new Error(`Fecha sin zona mal formada: '${fechaIso}' (se espera 'AAAA-MM-DD').`);
  }
  const [, anio, mes, dia] = partes;
  const mediodia = new TZDate(Number(anio), Number(mes) - 1, Number(dia), 12, 0, 0, zona);
  return formatearFechaCorta(mediodia, zona);
}
