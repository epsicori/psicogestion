import { sumarDias } from '@/lib/fechas/calendario';

/**
 * El estado de un bono (T-027 §1.1): puro, derivado y de solo lectura. Nada de esto se escribe en
 * la base. Fechas `AAAA-MM-DD` comparadas como cadenas; el reloj no se lee aquí, lo pasa quien llama
 * (la zona de la organización).
 */

export type EstadoBono = 'vigente' | 'agotado' | 'caducado';

export type ConsumoBono = {
  sesionesTotales: number;
  sesionesConsumidas: number;
  caducidad: string | null;
};

export type LecturaBono = {
  estado: EstadoBono;
  /** `max(0, totales − consumidas)`. */
  saldo: number;
  /** Sesiones realizadas de más sobre las del bono. */
  excedidas: number;
  /** Solo para un bono vigente. */
  aviso: 'pocas' | 'caduca' | null;
};

/** Se avisa con esta cantidad de sesiones restantes, o menos. */
export const UMBRAL_SESIONES = 2;
/** Se avisa si la caducidad cae dentro de este número de días, o antes. */
export const UMBRAL_DIAS = 30;

/** Agotado prevalece sobre caducado; el día de la caducidad todavía vale. */
export function leerBono(c: ConsumoBono, hoy: string): LecturaBono {
  const diferencia = c.sesionesTotales - c.sesionesConsumidas;
  const saldo = Math.max(0, diferencia);
  const excedidas = Math.max(0, -diferencia);

  if (saldo <= 0) return { estado: 'agotado', saldo, excedidas, aviso: null };
  if (c.caducidad !== null && c.caducidad < hoy) return { estado: 'caducado', saldo, excedidas, aviso: null };

  let aviso: LecturaBono['aviso'] = null;
  if (saldo <= UMBRAL_SESIONES) aviso = 'pocas';
  else if (c.caducidad !== null && c.caducidad <= sumarDias(hoy, UMBRAL_DIAS)) aviso = 'caduca';

  return { estado: 'vigente', saldo, excedidas, aviso };
}
