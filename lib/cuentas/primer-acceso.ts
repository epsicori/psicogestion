import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../supabase/tipos-bd';

/**
 * El primer acceso (T-006·b2), en el orden del ticket y sin atajos:
 * contraseña → TOTP → PIN. La contraseña ya la fijó Supabase Auth al aceptar la
 * invitación, así que aquí solo quedan los dos últimos.
 *
 * - `totp`: esta sesión no ha pasado el segundo factor. Puede ser porque el
 *   usuario no tiene factor (hay que enrolarlo) o porque lo tiene y no lo ha
 *   verificado hoy (hay que retarlo). Quién de las dos lo decide la pantalla, que
 *   es quien puede listar los factores; la guardia no necesita saberlo.
 * - `pin`: el perfil exige PIN de historia (ADR-026) y no lo tiene fijado. El
 *   técnico administrativo no tiene historia que abrir, así que `requiere_pin` es
 *   falso para él y no ve este paso — la decisión viene de la base, no de un
 *   condicional en la pantalla.
 */
export type PasoPrimerAcceso = 'totp' | 'pin';

/**
 * Qué paso le falta a esta sesión, o `null` si no le falta ninguno.
 *
 * **El orden de las dos comprobaciones no es casual**: el nivel de la sesión se
 * resuelve leyendo el token que ya está en la cookie, mientras que
 * `estado_de_cuenta()` es un viaje a la base. Preguntar primero por el barato
 * ahorra ese viaje en la única petición donde de verdad hace falta cortar.
 *
 * Y ninguna de las dos sobra: el nivel sabe si ESTA sesión pasó el segundo factor
 * —eso vive en el token y no en la tabla— y `estado_de_cuenta()` sabe si al perfil
 * le falta el PIN —eso vive en la tabla y no en el token—.
 */
export async function primerAccesoPendiente(
  supabase: SupabaseClient<Database>,
): Promise<PasoPrimerAcceso | null> {
  const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (nivel?.currentLevel !== 'aal2') return 'totp';

  const { data, error } = await supabase.rpc('estado_de_cuenta');

  if (error) {
    // Sin estado no se puede afirmar que falte un paso, y cortar el paso a toda la
    // aplicación por un fallo de lectura sería peor que dejar pasar: cada Server
    // Action revalida por su cuenta y RLS sigue en pie detrás.
    console.error('primerAccesoPendiente: fallo al leer estado_de_cuenta()', error);
    return null;
  }

  const fila = data?.[0];
  if (!fila) return null;

  return fila.requiere_pin && !fila.tiene_pin ? 'pin' : null;
}
