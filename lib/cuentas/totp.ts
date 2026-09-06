import 'server-only';

import { crearClienteAdministracion } from '../supabase/administracion';
import type { Sesion } from './tipos';

async function borrarFactoresTotp(administracion: ReturnType<typeof crearClienteAdministracion>, perfilId: string) {
  const { data, error } = await administracion.auth.admin.mfa.listFactors({ userId: perfilId });
  if (error) {
    console.error('borrarFactoresTotp: no se pudieron listar los factores', error);
    return;
  }
  for (const factor of data.factors) {
    const { error: errorBorrado } = await administracion.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: perfilId,
    });
    if (errorBorrado) {
      console.error('borrarFactoresTotp: no se pudo borrar un factor', errorBorrado);
    }
  }
}

export type ResultadoReposicionTotp = { ok: true } | { ok: false; mensaje: string };

/**
 * Repone el TOTP de OTRO perfil. Solo un administrador. Primero la base (audita y avisa
 * al titular vía `registrar_reposicion_totp()`), después el borrado real del factor con
 * la Admin API — SQL no puede tocar `auth.mfa_factors`.
 */
export async function reponerTotp(
  sesion: Sesion,
  entrada: { perfilId: string },
): Promise<ResultadoReposicionTotp> {
  const { error } = await sesion.supabase.rpc('registrar_reposicion_totp', {
    p_perfil_id: entrada.perfilId,
  });
  if (error) {
    console.error('reponerTotp: registrar_reposicion_totp() falló', error);
    return { ok: false, mensaje: 'No se pudo reponer el TOTP: revisa que seas administrador.' };
  }

  await borrarFactoresTotp(crearClienteAdministracion(), entrada.perfilId);
  return { ok: true };
}

export type ResultadoCodigosRecuperacion = { ok: true; codigos: string[] } | { ok: false; mensaje: string };

/** Genera diez códigos de recuperación EN CLARO, para mostrar una sola vez. */
export async function generarCodigosRecuperacion(sesion: Sesion): Promise<ResultadoCodigosRecuperacion> {
  const { data, error } = await sesion.supabase.rpc('generar_codigos_recuperacion');
  if (error || !data) {
    console.error('generarCodigosRecuperacion: fallo al generar los códigos', error);
    return { ok: false, mensaje: 'No se pudieron generar los códigos de recuperación.' };
  }
  return { ok: true, codigos: data };
}

export type ResultadoCanjeCodigo = {
  canjeado: boolean;
  motivo: 'ok' | 'codigo_invalido' | 'bloqueado' | 'sin_codigos' | 'error';
  bloqueadoHasta: string | null;
};

/**
 * Canjea un código de recuperación DEL PROPIO usuario. Nunca lanza: `motivo` distingue
 * el resultado, igual que `desbloquear_historia()`. Si `motivo === 'ok'`, el código ya
 * quedó consumido en la base y el factor TOTP del usuario debe borrarse AQUÍ, con la
 * Admin API, para forzar el re-enrolamiento (decisión de dominio 2): un canje correcto
 * NO concede acceso por sí solo, y borrar el factor es lo que hace que la siguiente
 * entrada exija enrolar TOTP de nuevo en vez de quedarse a medias.
 */
export async function canjearCodigoRecuperacion(
  sesion: Sesion,
  codigo: string,
): Promise<ResultadoCanjeCodigo> {
  const { data, error } = await sesion.supabase.rpc('canjear_codigo_recuperacion', {
    p_codigo: codigo,
  });
  const fila = data?.[0];
  if (error || !fila) {
    console.error('canjearCodigoRecuperacion: fallo al llamar canjear_codigo_recuperacion()', error);
    return { canjeado: false, motivo: 'error', bloqueadoHasta: null };
  }

  if (fila.motivo === 'ok') {
    await borrarFactoresTotp(crearClienteAdministracion(), sesion.usuario.id);
  }

  return {
    canjeado: fila.canjeado,
    motivo: fila.motivo as ResultadoCanjeCodigo['motivo'],
    bloqueadoHasta: fila.bloqueado_hasta,
  };
}
