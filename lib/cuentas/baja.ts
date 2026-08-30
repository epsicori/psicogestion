import 'server-only';

import { crearClienteAdministracion } from '../supabase/administracion';
import type { Sesion } from './tipos';

export type ResultadoBaja =
  | { ok: true; desbloqueosRevocados: number; pinBorrado: boolean }
  | { ok: false; motivo: string; mensaje: string };

/**
 * Da de baja un perfil (ADR-032). EL ORDEN IMPORTA Y NO ES ARBITRARIO:
 *
 * 1. `dar_de_baja_perfil()` PRIMERO. Si falla —no administrador, perfil inexistente, o
 *    la restricción del último administrador activo (fn_impedir_baja_ultimo_administrador,
 *    ya en la base desde T-001)— se para AQUÍ y el perfil no se toca en absoluto.
 * 2. Solo si el paso 1 tiene éxito, DESPUÉS se borran los factores MFA y se banea el
 *    usuario en Auth con la Admin API.
 *
 * Al revés sería el error: si Auth fallara DESPUÉS de que la base ya diera el perfil de
 * baja, quedaría un perfil inaccesible con una sesión de Auth que nadie revocó — un
 * estado inconsistente pero no inseguro (RLS ya corta por `rol_actual()`/
 * `historia_desbloqueada()`, que exigen `estado = 'activo'`). Si Auth fallara ANTES de
 * que la base cambiara el estado, sería peor: sesión revocada pero perfil todavía
 * `activo`, lo que en la interfaz parecería que la baja no ocurrió cuando en realidad sí
 * revocó el acceso real. Base primero, Auth después: el peor caso posible es "más
 * seguro de lo que la pantalla dice", nunca al revés.
 */
export async function darDeBajaPerfil(
  sesion: Sesion,
  entrada: { perfilId: string; motivo: string | null },
): Promise<ResultadoBaja> {
  const { data, error } = await sesion.supabase.rpc('dar_de_baja_perfil', {
    p_perfil_id: entrada.perfilId,
    // p_motivo tiene default null en SQL: omitirlo (undefined) equivale a pasar null.
    p_motivo: entrada.motivo ?? undefined,
  });
  const fila = data?.[0];
  if (error || !fila) {
    console.error('darDeBajaPerfil: dar_de_baja_perfil() falló', error);
    return {
      ok: false,
      motivo: 'baja',
      mensaje:
        'No se pudo dar de baja el perfil. Si es el único administrador activo, ' +
        'la base lo impide a propósito (ADR-032).',
    };
  }

  const administracion = crearClienteAdministracion();

  const { data: factores, error: errorFactores } = await administracion.auth.admin.mfa.listFactors({
    userId: entrada.perfilId,
  });
  if (errorFactores) {
    console.error('darDeBajaPerfil: no se pudieron listar los factores MFA', errorFactores);
  } else {
    for (const factor of factores.factors) {
      const { error: errorBorrado } = await administracion.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: entrada.perfilId,
      });
      if (errorBorrado) {
        console.error('darDeBajaPerfil: no se pudo borrar un factor MFA', errorBorrado);
      }
    }
  }

  // 876000h ≈ cien años: el patrón documentado de la Admin API para banear
  // indefinidamente. No hay "para siempre" literal en la API.
  const { error: errorBaneo } = await administracion.auth.admin.updateUserById(entrada.perfilId, {
    ban_duration: '876000h',
  });
  if (errorBaneo) {
    console.error('darDeBajaPerfil: no se pudo banear al usuario en Auth', errorBaneo);
  }

  return {
    ok: true,
    desbloqueosRevocados: fila.desbloqueos_revocados,
    pinBorrado: fila.pin_borrado,
  };
}
