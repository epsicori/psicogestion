// T-012 · La fecha de la sesión es la fecha LOCAL del centro, no la UTC (ADR-071).
import { tz } from '@date-fns/tz';
import { format } from 'date-fns';

/** `AAAA-MM-DD` del instante en la zona IANA dada. */
export function fechaDeSesion(inicio: Date, zona: string): string {
  return format(inicio, 'yyyy-MM-dd', { in: tz(zona) });
}
