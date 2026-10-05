import 'server-only';

import type { EntradaAltaCentro } from './esquemas';
import type { ResultadoCuentas, Sesion } from './tipos';

// Envoltorios tipados de las altas de centro de quien atiende (T-041). Quién puede, a quién
// y en qué centro lo decide la base, en `dar_alta_centro()` y `retirar_alta_centro()`
// (migración 20261010120000): la aplicación y el banco de RLS ejecutan la MISMA llamada.
// Siempre con la sesión del administrador, nunca con el cliente de administración: con la
// clave de servicio `rol_actual()` es nulo. Mensajes literales en castellano — lib/cuentas/
// no importa lib/i18n/.

const MENSAJE_GENERICO = 'No se pudo guardar el cambio de centro.';

const MENSAJES_POR_CODIGO: Record<string, string> = {
  '42501': 'Solo el administrador da o retira altas de centro.',
  '22023': 'Las altas de centro son para profesionales sanitarios y administradores.',
  '23503': 'El perfil o el centro no existen.',
  P0002: 'No tenía alta vigente en ese centro: puede que otra persona la haya retirado ya.',
  '23505': 'Otro cambio se ha cruzado con este. Vuelve a cargar la página y repite.',
};

/**
 * El mensaje que ve el administrador, por SQLSTATE. Solo 23514 deja pasar el texto de la
 * base: sus dos causas (perfil no activo, centro cerrado) las escribe la migración en
 * castellano llano. Cualquier otro texto de la base no sale.
 */
export function mensajeDeErrorDeAlta(
  codigo: string | undefined,
  mensajeBase: string | undefined,
): string {
  if (codigo === '23514') {
    return mensajeBase && mensajeBase.length > 0 ? mensajeBase : MENSAJE_GENERICO;
  }
  if (codigo !== undefined && codigo in MENSAJES_POR_CODIGO) {
    return MENSAJES_POR_CODIGO[codigo];
  }
  return MENSAJE_GENERICO;
}

function fallo(
  operacion: string,
  error: { code?: string; message?: string },
): { ok: false; motivo: string; mensaje: string } {
  const codigo = error.code;
  if (codigo === undefined || !(codigo in MENSAJES_POR_CODIGO || codigo === '23514')) {
    console.error(`${operacion}: la base rechazó el cambio`, error);
  }
  return { ok: false, motivo: codigo ?? 'desconocido', mensaje: mensajeDeErrorDeAlta(codigo, error.message) };
}

/** Da un alta vigente desde hoy. Idempotente: con alta vigente devuelve su id. */
export async function darAltaCentro(
  sesion: Sesion,
  entrada: EntradaAltaCentro,
): Promise<ResultadoCuentas<{ altaId: string }>> {
  const { data, error } = await sesion.supabase.rpc('dar_alta_centro', {
    p_perfil_id: entrada.perfilId,
    p_centro_id: entrada.centroId,
  });
  if (error) return fallo('darAltaCentro', error);
  if (typeof data !== 'string') {
    console.error('darAltaCentro: dar_alta_centro() no devolvió el id del alta', data);
    return { ok: false, motivo: 'sin_id', mensaje: MENSAJE_GENERICO };
  }
  return { ok: true, altaId: data };
}

/** Cierra (hasta = hoy) el alta vigente. Sin alta vigente, P0002: no es idempotente. */
export async function retirarAltaCentro(
  sesion: Sesion,
  entrada: EntradaAltaCentro,
): Promise<ResultadoCuentas<object>> {
  const { error } = await sesion.supabase.rpc('retirar_alta_centro', {
    p_perfil_id: entrada.perfilId,
    p_centro_id: entrada.centroId,
  });
  if (error) return fallo('retirarAltaCentro', error);
  return { ok: true };
}
