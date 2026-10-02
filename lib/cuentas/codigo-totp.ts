import { createHmac } from 'node:crypto';

/**
 * T-037 · RFC 6238 puro: sin secretos ni entorno.
 *
 * SIN `server-only` a propósito: lo importa el corredor de Playwright
 * (`accesibilidad/codigos-recuperacion.spec.ts`), donde ese paquete lanza al cargarse.
 * Los secretos de los factores sembrados siguen detrás de `server-only`, en
 * `modo-desarrollo.ts`. SIN 'use server': serían endpoints públicos.
 */

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
