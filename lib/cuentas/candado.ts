// Envoltorios tipados de las funciones del candado de la historia clínica (T-002,
// ADR-026) y de estado_de_cuenta() (T-006). El candado en sí no se reescribe aquí: solo
// se llama. Mensajes literales en castellano — lib/cuentas/ no importa lib/i18n/.
import type { Sesion } from './tipos';

export type EstadoCuenta = {
  rol: 'administrador' | 'profesional_sanitario' | 'tecnico_administrativo';
  estado: 'activo' | 'suspendido' | 'baja';
  requierePin: boolean;
  tienePin: boolean;
  desbloqueoCaducaEn: string | null;
};

/**
 * Estado de la cuenta del usuario actual: rol, estado, y si el candado del PIN le
 * corresponde y está fijado. La usan el primer acceso (contraseña → TOTP → PIN) y la
 * pantalla del candado para decidir qué paso falta, sin volver a preguntar en cliente.
 */
export async function estadoDeCuenta(sesion: Sesion): Promise<EstadoCuenta | null> {
  const { data, error } = await sesion.supabase.rpc('estado_de_cuenta');
  if (error) {
    console.error('estadoDeCuenta: fallo al llamar estado_de_cuenta()', error);
    return null;
  }
  const fila = data?.[0];
  if (!fila) return null;
  return {
    rol: fila.rol,
    estado: fila.estado,
    requierePin: fila.requiere_pin,
    tienePin: fila.tiene_pin,
    desbloqueoCaducaEn: fila.desbloqueo_caduca_en,
  };
}

export type ResultadoDesbloqueo = {
  desbloqueado: boolean;
  motivo: string;
  caducaEn: string | null;
  bloqueadoHasta: string | null;
};

/** Fija (o cambia) el PIN propio. Sin parámetro de perfil: nadie fija el PIN de otro. */
export async function fijarPinHistoria(
  sesion: Sesion,
  pin: string,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const { error } = await sesion.supabase.rpc('fijar_pin_historia', { p_pin: pin });
  if (error) {
    console.error('fijarPinHistoria: fallo al fijar el PIN', error);
    return { ok: false, mensaje: 'No se pudo fijar el PIN.' };
  }
  return { ok: true };
}

/** Verifica el PIN propio y abre (o no) la ventana de desbloqueo. Nunca lanza. */
export async function desbloquearHistoria(
  sesion: Sesion,
  pin: string,
): Promise<ResultadoDesbloqueo> {
  const { data, error } = await sesion.supabase.rpc('desbloquear_historia', { p_pin: pin });
  const fila = data?.[0];
  if (error || !fila) {
    console.error('desbloquearHistoria: fallo al llamar desbloquear_historia()', error);
    return { desbloqueado: false, motivo: 'error', caducaEn: null, bloqueadoHasta: null };
  }
  return {
    desbloqueado: fila.desbloqueado,
    motivo: fila.motivo,
    caducaEn: fila.caduca_en,
    bloqueadoHasta: fila.bloqueado_hasta,
  };
}

/** Cierra el candado del usuario actual. Siempre disponible, nunca desde el renderizado. */
export async function bloquearHistoria(sesion: Sesion): Promise<number> {
  const { data, error } = await sesion.supabase.rpc('bloquear_historia');
  if (error) {
    console.error('bloquearHistoria: fallo al bloquear', error);
    return 0;
  }
  return data ?? 0;
}

/**
 * Prolonga un desbloqueo YA vigente. SOLO se llama desde una Server Action disparada
 * por una acción real (abrir paciente, guardar): jamás desde el renderizado (ADR-026).
 */
export async function prolongarDesbloqueo(sesion: Sesion): Promise<string | null> {
  const { data, error } = await sesion.supabase.rpc('prolongar_desbloqueo');
  if (error) {
    console.error('prolongarDesbloqueo: fallo al prolongar', error);
    return null;
  }
  return data ?? null;
}
