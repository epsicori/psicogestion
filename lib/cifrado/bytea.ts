// Traducción de columnas `bytea` de Postgres ↔ base64. Puro.
//
// PostgREST/supabase-js sirven una columna `bytea` como una cadena en la forma «hex de
// Postgres», con el prefijo `\x` (comprobado en tarea 0 de T-032 con un round-trip real
// contra la base local, no de memoria). Este es el único sitio donde se paga esa
// incógnita: si el formato de transporte cambiara alguna vez, se cambia aquí y en
// ningún otro sitio.

const PREFIJO_HEX_POSTGRES = '\\x';

/** Un `Buffer` a base64, para viajar como texto en un parámetro de RPC. */
export function aBase64(valor: Buffer): string {
  return valor.toString('base64');
}

/**
 * Una columna `bytea` tal como la sirve PostgREST (`\xAABB…`) a `Buffer`. `null` da
 * `null`. Lanza con un mensaje propio si la forma no es la esperada: un error de
 * OpenSSL o de índice fuera de rango, más adelante, sería ilegible.
 */
export function desdeBytea(valor: string | null): Buffer | null {
  if (valor === null) return null;
  if (!valor.startsWith(PREFIJO_HEX_POSTGRES)) {
    throw new Error(
      `Valor de columna bytea con formato inesperado (no empieza por "\\x"): ${JSON.stringify(
        valor,
      )}. PostgREST cambió su serialización, o esto no es una columna bytea.`,
    );
  }
  return Buffer.from(valor.slice(PREFIJO_HEX_POSTGRES.length), 'hex');
}
