// AES-256-GCM con nonce al azar (T-032, ADR-029). Puro: sin `server-only`, sin cliente de
// Supabase, para que Vitest lo pruebe sin montar medio Next.
//
// `cifrar`/`descifrar`/`indice` no normalizan el texto de entrada: la normalización
// (`normalizarNif` de lib/identidad) ocurre en la capa de arriba (lib/cifrado/identificacion.ts),
// antes de llamar aquí. Este módulo solo sabe de bytes y claves.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export type Sobre = { cifrado: Buffer; nonce: Buffer; etiqueta: Buffer };

const LONGITUD_CLAVE = 32; // AES-256
const LONGITUD_NONCE = 12; // recomendado por NIST para GCM

function exigirClave(clave: Buffer): void {
  if (clave.length !== LONGITUD_CLAVE) {
    throw new Error(
      `La clave debe tener 32 bytes (AES-256); recibida de ${clave.length}. ` +
        'Una clave corta produce un error de OpenSSL ilegible: se comprueba aquí antes.',
    );
  }
}

/** Cifra `texto` con AES-256-GCM y un nonce nuevo al azar en cada llamada. */
export function cifrar(clave: Buffer, texto: string): Sobre {
  exigirClave(clave);
  const nonce = randomBytes(LONGITUD_NONCE);
  const cifrador = createCipheriv('aes-256-gcm', clave, nonce);
  const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return { cifrado, nonce, etiqueta };
}

/**
 * Descifra un `Sobre`. LANZA si la etiqueta no cuadra (cifrado o etiqueta manipulados,
 * o clave equivocada): no se captura aquí, decide qué pintar la capa de arriba.
 */
export function descifrar(clave: Buffer, sobre: Sobre): string {
  exigirClave(clave);
  const descifrador = createDecipheriv('aes-256-gcm', clave, sobre.nonce);
  descifrador.setAuthTag(sobre.etiqueta);
  const texto = Buffer.concat([descifrador.update(sobre.cifrado), descifrador.final()]);
  return texto.toString('utf8');
}

/** HMAC-SHA-256 de 32 bytes, para el índice ciego (ADR-029). Determinista: sin nonce. */
export function indice(clave: Buffer, texto: string): Buffer {
  exigirClave(clave);
  return createHmac('sha256', clave).update(texto, 'utf8').digest();
}
