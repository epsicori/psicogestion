// T-040 · Cifra la copia EN EL NAVEGADOR (D1): la contraseña no sale de aquí. También corre en
// Node, para las pruebas. Orden del diseño §1.3:
//   1. la contraseña normalizada a NFC mide de 12 a 256, o no se deriva nada;
//   2. sal (16) y nonce (12) del generador;
//   3. clave = derivar(UTF-8(NFC(contraseña)), sal, KDF);
//   4. la cabecera, cuyos bytes exactos son los datos asociados de AES-256-GCM;
//   5. la carga en base64 por trozos; el fichero; la huella SHA-256 del fichero en UTF-8.
import { CONTRASENA_MAX, CONTRASENA_MIN, KDF, NONCE_BYTES, SAL_BYTES } from './constantes';
import { aBase64, cabeceraDelFichero, componerFichero, textosDelVisor } from './fichero';
import type { CopiaV1 } from './formato';

export type Derivar = (contrasena: Uint8Array, sal: Uint8Array, kdf: typeof KDF) => Promise<Uint8Array>;

/** La contraseña no cumple los límites: no se ha derivado ni cifrado nada. */
export class ErrorContrasena extends Error {
  constructor() {
    super(`La contraseña mide de ${CONTRASENA_MIN} a ${CONTRASENA_MAX} caracteres`);
    this.name = 'ErrorContrasena';
  }
}

const aleatorioDelSistema = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** Una copia con su propio `ArrayBuffer`: lo que WebCrypto acepta como `BufferSource`. */
const propio = (b: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(b);

const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

export async function cifrarCopia(
  copia: CopiaV1,
  contrasena: string,
  derivar: Derivar,
  aleatorio: (n: number) => Uint8Array = aleatorioDelSistema,
): Promise<{ html: string; huellaHex: string }> {
  const normalizada = contrasena.normalize('NFC');
  // En caracteres (puntos de código), como dice ADR-076 §7: no en unidades UTF-16.
  const caracteres = [...normalizada].length;
  if (caracteres < CONTRASENA_MIN || caracteres > CONTRASENA_MAX) {
    throw new ErrorContrasena();
  }

  const utf8 = new TextEncoder();
  const sal = aleatorio(SAL_BYTES);
  const nonce = aleatorio(NONCE_BYTES);
  const bytesDeClave = await derivar(utf8.encode(normalizada), sal, KDF);
  const cabecera = cabeceraDelFichero(sal, nonce);

  const clave = await crypto.subtle.importKey('raw', propio(bytesDeClave), { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);
  bytesDeClave.fill(0);
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: propio(nonce), additionalData: utf8.encode(cabecera), tagLength: 128 },
    clave,
    utf8.encode(JSON.stringify(copia)),
  );

  const html = componerFichero({ cabecera, cargaB64: aBase64(new Uint8Array(cifrado)), textos: textosDelVisor() });
  const huellaHex = hex(await crypto.subtle.digest('SHA-256', utf8.encode(html)));
  return { html, huellaHex };
}
