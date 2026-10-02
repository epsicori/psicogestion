import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { urlSupabase } from '../supabase/config';
import type { Database } from '../supabase/tipos-bd';

import { codigoTotp } from './codigo-totp';

// Misma API pública: el cálculo vive en `codigo-totp.ts` (sin `server-only`, T-037).
export { codigoTotp };

/**
 * T-033 · Modo local del segundo factor.
 *
 * En desarrollo local, al iniciar sesión con una cuenta de `npm run seed`, el servidor
 * calcula el TOTP del factor SEMBRADO y lo verifica con GoTrue: la sesión llega a `aal2`
 * de verdad, la base no cambia y la guardia (`proxy.ts`, `primer-acceso.ts`) tampoco.
 *
 * Por qué no puede llegar a producción, en tres capas:
 * 1. `instrumentation.ts` evalúa el modo al arrancar: mal puesto, el proceso sale.
 * 2. Cada evaluación con la variable puesta y Supabase no local lanza `ErrorModoLocal`.
 * 3. Solo supera factores cuyo secreto está en `supabase/seed-completo.sql`: ninguna
 *    cuenta real.
 *
 * SIN 'use server' a propósito: con esa directiva estas funciones serían endpoints
 * públicos llamables desde el navegador.
 */

/** Único valor que activa el modo. Cualquier otro valor no vacío detiene el proceso. */
export const VALOR_ACTIVO = 'activo';

export const HOSTS_LOCALES: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost']);

export class ErrorModoLocal extends Error {
  override name = 'ErrorModoLocal';
}

/**
 * Pura: decide con lo que recibe. EL ORDEN ES CONTRATO: ausente o vacía devuelve `false`
 * antes de mirar la URL, para que producción (sin la variable) no gane ningún camino de
 * error nuevo.
 */
export function decidirModoSegundoFactor(
  variable: string | undefined,
  urlSupabaseActual: string,
): boolean {
  if (variable === undefined || variable === '') return false;

  if (variable !== VALOR_ACTIVO) {
    throw new ErrorModoLocal(
      'SEGUNDO_FACTOR_AUTOMATICO_LOCAL tiene un valor no reconocido; los únicos valores son ' +
        '`activo` o no definirla.',
    );
  }

  let url: URL;
  try {
    url = new URL(urlSupabaseActual);
  } catch {
    throw new ErrorModoLocal(
      'SEGUNDO_FACTOR_AUTOMATICO_LOCAL está definida y la URL de Supabase no se puede leer. ' +
        'Este modo solo existe en desarrollo local: quita la variable de este entorno.',
    );
  }

  // Igualdad exacta del host; nada de includes/startsWith/expresiones sobre la cadena.
  if (url.protocol !== 'http:' || !HOSTS_LOCALES.has(url.hostname)) {
    throw new ErrorModoLocal(
      `SEGUNDO_FACTOR_AUTOMATICO_LOCAL está definida y Supabase no es local (host «${url.hostname}»). ` +
        'Este modo solo existe en desarrollo local: quita la variable de este entorno.',
    );
  }

  return true;
}

/**
 * Lee el entorno en el momento de la llamada. La lectura es literal y sin `NEXT_PUBLIC_`:
 * jamás se inlinea al navegador.
 */
export function segundoFactorAutomaticoActivo(): boolean {
  return decidirModoSegundoFactor(process.env.SEGUNDO_FACTOR_AUTOMATICO_LOCAL, urlSupabase);
}

/**
 * Los cinco factores de `supabase/seed-completo.sql` (id → secreto). Exportado SOLO para
 * la prueba de deriva contra la siembra.
 */
export const FACTORES_SEMBRADOS: ReadonlyMap<string, string> = new Map([
  ['a0080004-0000-4000-8000-000000000001', 'SEMILLATOTPDEMOANA'],
  ['a0080004-0000-4000-8000-000000000002', 'SEMILLATOTPDEMOBRU'],
  ['a0080004-0000-4000-8000-000000000003', 'SEMILLATOTPDEMOTEC'],
  ['a0080004-0000-4000-8000-000000000004', 'SEMILLATOTPDEMOBAJ'],
  ['a0080004-0000-4000-8000-000000000005', 'SEMILLATOTPDEMOADM'],
]);

export type ResultadoPaseAutomatico =
  | 'inactivo' // el modo no está activo: no se ha llamado a nada de MFA
  | 'sin_factor_sembrado' // ningún factor verificado del usuario está en FACTORES_SEMBRADOS
  | 'superado' // challengeAndVerify sin error
  | 'fallo'; // listFactors o challengeAndVerify devolvieron error

/**
 * Supera el TOTP del factor sembrado del usuario de la sesión. Nunca registra ni devuelve
 * el secreto ni el código, y nunca lanza por un fallo de Auth (sí propaga `ErrorModoLocal`).
 */
export async function superarSegundoFactorSembrado(
  supabase: SupabaseClient<Database>,
): Promise<ResultadoPaseAutomatico> {
  // Se recomprueba aquí aunque el llamante ya lo haya hecho: ninguna puerta futura puede
  // llamarla sin el modo.
  if (!segundoFactorAutomaticoActivo()) return 'inactivo';

  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    console.warn('[modo local] no se pudieron listar los factores', error.code);
    return 'fallo';
  }

  // El filtro por `FACTORES_SEMBRADOS.has` ES la capa 3: nunca «el primer factor verificado».
  const factor = (data?.totp ?? []).find((f) => FACTORES_SEMBRADOS.has(f.id));
  if (!factor) return 'sin_factor_sembrado';

  const { error: errorVerificacion } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: codigoTotp(FACTORES_SEMBRADOS.get(factor.id)!, Date.now()),
  });
  if (errorVerificacion) {
    console.warn(
      '[modo local] el TOTP sembrado no se aceptó; ¿reloj de Docker desfasado?',
      errorVerificacion.code,
    );
    return 'fallo';
  }

  return 'superado';
}
