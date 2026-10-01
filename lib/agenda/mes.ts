// La rejilla del mes: 6 × 7 días, lunes primero. Pura, sin zona ni reloj.
import { diaDeLaSemana, sumarDias } from '@/lib/fechas/calendario';

/** El lunes de la semana (ISO) que contiene `fecha`. */
export function lunesDeLaSemana(fecha: string): string {
  return sumarDias(fecha, 1 - diaDeLaSemana(fecha));
}

/**
 * Siempre 42 días: del lunes de la semana que contiene el día 1 del mes de
 * `fecha` en adelante. `delMes` marca los del propio mes.
 */
export function diasDelMes(fecha: string): { fecha: string; delMes: boolean }[] {
  // `sumarDias` valida la fecha antes de recortarla al día 1.
  const primero = `${sumarDias(fecha, 0).slice(0, 7)}-01`;
  const mes = primero.slice(0, 7);
  const inicio = lunesDeLaSemana(primero);
  return Array.from({ length: 42 }, (_, i) => {
    const f = sumarDias(inicio, i);
    return { fecha: f, delMes: f.slice(0, 7) === mes };
  });
}
