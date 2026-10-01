import 'server-only';

import { createHmac } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { urlSupabase } from '../supabase/config';
import type { Database } from '../supabase/tipos-bd';

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

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648. Quita '=' y espacios, pasa a mayúsculas; los bits sobrantes se descartan. */
function decodificarBase32(secreto: string): Buffer {
  const limpio = secreto.replace(/[=\s]/g, '').toUpperCase();
  const bytes: number[] = [];
  let acumulado = 0;
  let bits = 0;
  for (const caracter of limpio) {
    const valor = ALFABETO_BASE32.indexOf(caracter);
    if (valor === -1) {
      throw new Error('codigoTotp: el secreto tiene un carácter fuera del alfabeto base32.');
    }
    acumulado = (acumulado << 5) | valor;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acumulado >>> bits) & 0xff);
    }
    acumulado &= (1 << bits) - 1;
  }
  return Buffer.from(bytes);
}

/** Pura. RFC 6238: HMAC-SHA1, periodo 30 s, 6 dígitos, truncado dinámico RFC 4226. */
export function codigoTotp(secretoBase32: string, instanteMs: number): string {
  const clave = decodificarBase32(secretoBase32);
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(instanteMs / 1000 / 30)));

  const hmac = createHmac('sha1', clave).update(contador).digest();
  const desplazamiento = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[desplazamiento] & 0x7f) << 24) |
    (hmac[desplazamiento + 1] << 16) |
    (hmac[desplazamiento + 2] << 8) |
    hmac[desplazamiento + 3];

  return String(binario % 1_000_000).padStart(6, '0');
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
