// Formateo de instantes en una zona IANA explícita, con el locale `es` de
// date-fns. Ninguna función de este módulo usa la zona del sistema.
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { tz } from '@date-fns/tz';

/** «10:05» — hora local del instante en la zona dada. */
export function formatearHora(instante: Date, zona: string): string {
  return format(instante, 'HH:mm', { in: tz(zona), locale: es });
}

/** «29/03/2026» — fecha corta española. */
export function formatearFechaCorta(instante: Date, zona: string): string {
  return format(instante, 'dd/MM/yyyy', { in: tz(zona), locale: es });
}

/** «domingo, 29 de marzo de 2026» — nombres de día y mes del locale, no de un array propio. */
export function formatearFechaLarga(instante: Date, zona: string): string {
  return format(instante, "EEEE, d 'de' MMMM 'de' yyyy", { in: tz(zona), locale: es });
}

/** «10:00 – 10:50» — rango horario de un intervalo en la misma zona. */
export function formatearRango(inicio: Date, fin: Date, zona: string): string {
  return `${formatearHora(inicio, zona)} – ${formatearHora(fin, zona)}`;
}
