import 'server-only';

// T-046 · El NIF del destinatario, cifrado en servidor con la clave de la identificación
// (`identificacion_cifrado_v1`, versión 1: el contrato con `lib/facturacion/nif.ts`).
//
// Este módulo NO importa `descifrar`: corregir con «conservar» arrastra los bytes de la versión
// anterior tal cual (D11). El editor nunca ve el NIF guardado.
import { cifrar } from '@/lib/cifrado/aes-gcm';
import { aBase64, desdeBytea } from '@/lib/cifrado/bytea';

import type { NifCifrado } from './tipos';

/** Cifra un NIF ya normalizado con un nonce nuevo. Base64 para viajar como parámetro de la RPC. */
export function cifrarNif(clave: Buffer, nifNormalizado: string): NonNullable<NifCifrado> {
  const sobre = cifrar(clave, nifNormalizado);
  return {
    cifrado: aBase64(sobre.cifrado),
    nonce: aBase64(sobre.nonce),
    etiqueta: aBase64(sobre.etiqueta),
  };
}

/**
 * Las tres columnas `bytea` de una versión (como las sirve PostgREST, `\x…`) → base64, sin
 * descifrar. Las tres nulas dan `null`; una mezcla lanza, porque la base no la admite.
 */
export function arrastrarNif(fila: {
  cifrado: string | null;
  nonce: string | null;
  etiqueta: string | null;
}): NifCifrado {
  const cifrado = desdeBytea(fila.cifrado);
  const nonce = desdeBytea(fila.nonce);
  const etiqueta = desdeBytea(fila.etiqueta);
  if (cifrado === null && nonce === null && etiqueta === null) return null;
  if (cifrado === null || nonce === null || etiqueta === null) {
    throw new Error('El NIF de la versión anterior está incompleto.');
  }
  return { cifrado: aBase64(cifrado), nonce: aBase64(nonce), etiqueta: aBase64(etiqueta) };
}
