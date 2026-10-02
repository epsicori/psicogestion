// T-040 · Compone el `.html` autodescifrable (ADR-076, diseño §1.3).
//
// Fuera de la carga cifrada solo hay: la cabecera (formato, cifrado, parámetros, sal y nonce),
// la carga en base64, los textos genéricos de `exportaciones.visor.*` y el código. Ningún dato
// del paciente, de la nota ni de quien exporta.
import { es, t } from '@/lib/i18n';

import { ALGORITMO, FORMATO, FORMATO_VERSION, KDF, NONCE_BYTES, SAL_BYTES } from './constantes';
import { scriptDelNucleo } from './nucleo-js';
import { VISOR_JS } from './visor-js';

/** Base64 estándar por trozos: nunca `String.fromCharCode(...)` con un array grande. */
export function aBase64(bytes: Uint8Array): string {
  const TROZO = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return btoa(binario);
}

/**
 * La cabecera en claro: JSON ASCII con un orden de claves fijo. Sus bytes exactos son los datos
 * asociados de AES-GCM, así que cambiar un carácter (un parámetro, la sal, un espacio) impide abrir.
 */
export function cabeceraDelFichero(sal: Uint8Array, nonce: Uint8Array): string {
  if (sal.length !== SAL_BYTES) throw new Error(`La sal mide ${SAL_BYTES} bytes`);
  if (nonce.length !== NONCE_BYTES) throw new Error(`El nonce mide ${NONCE_BYTES} bytes`);
  return JSON.stringify({
    formato: FORMATO,
    formato_version: FORMATO_VERSION,
    cifrado: ALGORITMO,
    kdf: { m: KDF.m, t: KDF.t, p: KDF.p, longitud: KDF.longitud, sal: aBase64(sal) },
    nonce: aBase64(nonce),
  });
}

/** Los textos genéricos de la pantalla de apertura, todos los de `exportaciones.visor.*`. */
export function textosDelVisor(): Record<string, string> {
  const claves = Object.keys(es.exportaciones.visor) as (keyof typeof es.exportaciones.visor)[];
  return Object.fromEntries(claves.map((c) => [c, t(`exportaciones.visor.${c}`)]));
}

const escaparHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON dentro de `<script type="application/json">`: sin `<`, no puede cerrar la etiqueta. */
const jsonEnScript = (valor: unknown) => JSON.stringify(valor).replace(/</g, '\\u003c');

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'";

const CSS = [
  ':root{color-scheme:light;}',
  'body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2328;background:#fff;line-height:1.5;}',
  'main{max-width:46rem;margin:0 auto;padding:2rem 1rem 4rem;position:relative;}',
  'h1{font-size:1.5rem;margin:0 0 1rem;}',
  'h2{font-size:1.15rem;margin:2rem 0 .5rem;padding-top:1rem;border-top:1px solid #d0d7de;}',
  'form{display:flex;flex-direction:column;gap:.5rem;max-width:24rem;}',
  'label{font-weight:600;}',
  'input{font:inherit;padding:.5rem .6rem;border:1px solid #8c959f;border-radius:6px;}',
  'input:focus-visible,button:focus-visible{outline:3px solid #0969da;outline-offset:2px;}',
  'button{font:inherit;padding:.5rem 1rem;border:0;border-radius:6px;background:#1f6feb;color:#fff;cursor:pointer;align-self:flex-start;}',
  '[role=alert]{color:#a40e26;font-weight:600;}',
  'dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem;margin:0 0 1rem;}',
  'dt{color:#57606a;}dd{margin:0;}',
  '.texto,.canonico{white-space:pre-wrap;overflow-wrap:anywhere;}',
  '.texto{padding:.75rem;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;}',
  '.canonico,.huella{font-family:ui-monospace,Consolas,monospace;font-size:.8rem;overflow-wrap:anywhere;}',
  '.marca-linea{font-size:.85rem;padding:.5rem .75rem;border:1px solid #d4a72c;background:#fff8c5;border-radius:6px;}',
  '.avisos{font-size:.9rem;color:#57606a;}',
  '@media print{form,[role=status]{display:none;}.marca-capa{position:fixed!important;}main{max-width:none;}h2{break-after:avoid;}}',
].join('');

export interface PartesDelFichero {
  cabecera: string;
  cargaB64: string;
  textos: Record<string, string>;
}

/** El `.html` completo. Lanza antes que componer algo que pudiera romper sus propios `<script>`. */
export function componerFichero({ cabecera, cargaB64, textos }: PartesDelFichero): string {
  // La cabecera va LITERAL (sus bytes son los datos asociados): no se puede escapar, así que
  // si tuviera `<`, `>` o `&` no se compone.
  if (/[<>&]/.test(cabecera)) throw new Error('La cabecera no puede llevar <, > ni &');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cargaB64)) throw new Error('La carga tiene que ir en base64');
  const codigo = scriptDelNucleo() + '\n' + VISOR_JS;
  if (/<\/script|<!--/i.test(codigo)) throw new Error('El código del visor no puede cerrar su <script>');

  return [
    '<!doctype html>',
    '<html lang="es">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    `<title>${escaparHtml(textos.tituloDocumento ?? '')}</title>`,
    `<style>${CSS}</style>`,
    '</head>',
    '<body>',
    `<noscript><p>${escaparHtml(textos.sinJs ?? '')}</p></noscript>`,
    '<main id="visor"></main>',
    `<script type="application/json" id="cabecera">${cabecera}</script>`,
    `<script type="application/json" id="carga">${JSON.stringify(cargaB64)}</script>`,
    `<script type="application/json" id="textos">${jsonEnScript(textos)}</script>`,
    `<script>${codigo}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}
