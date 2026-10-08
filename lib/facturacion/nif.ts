import 'server-only';

import { descifrar } from '@/lib/cifrado/aes-gcm';
import { desdeBytea } from '@/lib/cifrado/bytea';
import { claveDeCifrado } from '@/lib/cifrado/claves';

import type { FilaReclamada } from './cola';

/**
 * El NIF del destinatario de una versión, en claro, o `null` si no lo hay. Contrato con T-046: el NIF
 * se cifra con `identificacion_cifrado_v1`, versión de clave 1. Otra versión lanza un error fijo, que
 * la cola trata como `rechazado`.
 */
export async function descifrarNifDestinatario(
  fila: Pick<
    FilaReclamada,
    | 'destinatario_nif_cifrado'
    | 'destinatario_nif_nonce'
    | 'destinatario_nif_etiqueta'
    | 'destinatario_nif_clave_version'
  >,
): Promise<string | null> {
  const cifrado = desdeBytea(fila.destinatario_nif_cifrado);
  const nonce = desdeBytea(fila.destinatario_nif_nonce);
  const etiqueta = desdeBytea(fila.destinatario_nif_etiqueta);
  if (
    cifrado === null &&
    nonce === null &&
    etiqueta === null &&
    fila.destinatario_nif_clave_version === null
  ) {
    return null;
  }
  if (fila.destinatario_nif_clave_version !== 1 || !cifrado || !nonce || !etiqueta) {
    throw new Error('El NIF del destinatario no se puede descifrar.');
  }
  return descifrar(await claveDeCifrado(), { cifrado, nonce, etiqueta });
}
