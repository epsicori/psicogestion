'use server';

import { bloquearHistoria, desbloquearHistoria, prolongarDesbloqueo } from '@/lib/cuentas/candado';
import { esquemaPin } from '@/lib/cuentas/esquemas';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

export type ResultadoApertura =
  | { abierta: true; caducaEn: string | null }
  | { abierta: false; mensaje: string; bloqueadoHasta: string | null };

/**
 * Abre la historia con el PIN propio (ADR-026).
 *
 * **Lo que esta acción NO hace, y es deliberado**: no dice cuántos intentos quedan,
 * y no separa «ya estabas bloqueado» de «acabas de bloquearte» — la base devuelve
 * `bloqueado` para las dos a propósito, y contar intentos en voz alta le da a quien
 * prueba PINes justo la señal que necesita para saber si va bien.
 */
export async function abrirHistoria(datos: unknown): Promise<ResultadoApertura> {
  const sesion = await exigirSesion();
  const resultado = esquemaPin.safeParse(datos);

  if (!resultado.success) {
    return { abierta: false, mensaje: t('candado.pinNoValido'), bloqueadoHasta: null };
  }

  const apertura = await desbloquearHistoria(sesion, resultado.data.pin);

  if (apertura.desbloqueado) {
    return { abierta: true, caducaEn: apertura.caducaEn };
  }

  if (apertura.motivo === 'bloqueado') {
    return {
      abierta: false,
      mensaje: t('candado.bloqueado'),
      bloqueadoHasta: apertura.bloqueadoHasta,
    };
  }

  // `pin_incorrecto`, `sin_pin` y `error` comparten mensaje: distinguirlos aquí sería
  // decirle a quien prueba si el PIN existe siquiera.
  return { abierta: false, mensaje: t('candado.pinIncorrecto'), bloqueadoHasta: null };
}

/** Cierra el candado. Siempre disponible, y es la única forma de cerrarlo a mano. */
export async function cerrarHistoria(): Promise<{ cerradas: number }> {
  const sesion = await exigirSesion();
  return { cerradas: await bloquearHistoria(sesion) };
}

/**
 * Prolonga una ventana ya abierta. **Solo desde una acción real del usuario**
 * (ADR-026): si esto se llamara al renderizar, el candado no se cerraría jamás
 * mientras alguien tuviera la pantalla abierta, que es exactamente lo que el
 * candado existe para evitar.
 */
export async function prolongarApertura(): Promise<{ caducaEn: string | null }> {
  const sesion = await exigirSesion();
  return { caducaEn: await prolongarDesbloqueo(sesion) };
}

