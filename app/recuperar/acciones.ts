'use server';

import { canjearCodigoRecuperacion } from '@/lib/cuentas/totp';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

export type ResultadoCanje =
  | { ok: true }
  | { ok: false; mensaje: string; bloqueadoHasta: string | null };

/**
 * Canje de un código de recuperación, para quien perdió el segundo factor.
 *
 * Con `ok`, la base ya consumió el código **y `lib/cuentas/totp.ts` ya borró el
 * factor TOTP**: el canje no concede acceso por sí solo, obliga a enrolar de nuevo.
 * Por eso aquí no se redirige a ninguna parte concreta — basta con volver a
 * `/primera-vez`, que es quien decide el paso, y sin factor ese paso es enrolar.
 *
 * **`codigo_invalido` y `sin_codigos` comparten mensaje a propósito**: decirle «no
 * te quedan códigos» a quien está probando códigos ajenos es contarle algo sobre
 * una cuenta que no es suya.
 */
export async function canjearCodigo(codigo: string): Promise<ResultadoCanje> {
  const sesion = await exigirSesion();
  const resultado = await canjearCodigoRecuperacion(sesion, codigo.trim());

  if (resultado.canjeado) {
    return { ok: true };
  }

  if (resultado.motivo === 'bloqueado') {
    return {
      ok: false,
      mensaje: t('recuperar.bloqueado'),
      bloqueadoHasta: resultado.bloqueadoHasta,
    };
  }

  return { ok: false, mensaje: t('recuperar.codigoNoValido'), bloqueadoHasta: null };
}
