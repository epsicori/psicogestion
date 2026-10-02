// @vitest-environment node
// T-040 · El `.html` que se descarga (diseño §1.3, `fichero.ts`): la cabecera en claro no lleva
// ningún dato y el fichero no puede cerrar sus propios `<script>` antes de tiempo.
import { describe, expect, it } from 'vitest';

import { es } from '@/lib/i18n';

import { ALGORITMO, FORMATO, FORMATO_VERSION, KDF } from './constantes';
import { cabeceraDelFichero, componerFichero, textosDelVisor } from './fichero';
import { scriptDelNucleo } from './nucleo-js';
import { VISOR_JS } from './visor-js';

const sal = new Uint8Array(16).map((_, i) => i);
const nonce = new Uint8Array(12).map((_, i) => 200 + i);

describe('cabeceraDelFichero', () => {
  const cabecera = cabeceraDelFichero(sal, nonce);

  it('es JSON ASCII con las claves en el orden fijo y sin nada más', () => {
    expect(/^[\x20-\x7e]*$/.test(cabecera)).toBe(true);
    expect(cabecera).toBe(
      JSON.stringify({
        formato: FORMATO,
        formato_version: FORMATO_VERSION,
        cifrado: ALGORITMO,
        kdf: { m: KDF.m, t: KDF.t, p: KDF.p, longitud: KDF.longitud, sal: Buffer.from(sal).toString('base64') },
        nonce: Buffer.from(nonce).toString('base64'),
      }),
    );
    expect(Object.keys(JSON.parse(cabecera))).toEqual(['formato', 'formato_version', 'cifrado', 'kdf', 'nonce']);
  });

  it('rechaza una sal o un nonce de otra longitud', () => {
    expect(() => cabeceraDelFichero(new Uint8Array(15), nonce)).toThrow();
    expect(() => cabeceraDelFichero(sal, new Uint8Array(16))).toThrow();
  });
});

describe('textosDelVisor', () => {
  it('son exactamente los textos de exportaciones.visor.*', () => {
    expect(textosDelVisor()).toEqual({ ...es.exportaciones.visor });
  });
});

describe('componerFichero', () => {
  const cabecera = cabeceraDelFichero(sal, nonce);
  const textos = { ...textosDelVisor(), titulo: 'Copia </script><script>alert(1)</script> & <b>' };
  const html = componerFichero({ cabecera, cargaB64: 'QUJD', textos });

  it('empieza por el doctype, en español, con el charset primero y la CSP sin red', () => {
    expect(html.startsWith('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n')).toBe(true);
    expect(html).toContain(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">`,
    );
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
    expect(html).toContain('<noscript>');
  });

  it('lleva la cabecera literal, la carga como JSON y los textos con `<` escapado', () => {
    expect(html).toContain(`<script type="application/json" id="cabecera">${cabecera}</script>`);
    expect(html).toContain('<script type="application/json" id="carga">"QUJD"</script>');
    const textosEnFichero = /<script type="application\/json" id="textos">([^]*?)<\/script>/.exec(html);
    expect(textosEnFichero).not.toBeNull();
    expect(textosEnFichero![1]).not.toContain('<');
    expect(JSON.parse(textosEnFichero![1])).toEqual(textos);
  });

  it('solo cierra sus cuatro <script>: ningún texto ni el código pueden cerrar uno antes', () => {
    expect(html.match(/<\/script/gi)).toHaveLength(4);
    expect(html.match(/<script/gi)).toHaveLength(4);
    expect(scriptDelNucleo()).not.toMatch(/<\/script|<!--/i);
    expect(VISOR_JS).not.toMatch(/<\/script|<!--/i);
  });

  it('el código del visor va al final, con el núcleo delante', () => {
    expect(html).toContain(`<script>${scriptDelNucleo()}\n${VISOR_JS}</script>\n</body>\n</html>`);
  });

  it('el <title> sale de visor.tituloDocumento, escapado', () => {
    const conAmp = componerFichero({
      cabecera,
      cargaB64: '',
      textos: { ...textosDelVisor(), tituloDocumento: 'A & <B>' },
    });
    expect(conAmp).toContain('<title>A &amp; &lt;B&gt;</title>');
  });

  it('una cabecera con <, > o & lanza en vez de componer', () => {
    expect(() => componerFichero({ cabecera: '{"a":"</script>"}', cargaB64: '', textos })).toThrow();
    expect(() => componerFichero({ cabecera: '{"a":"&"}', cargaB64: '', textos })).toThrow();
  });

  it('una carga que no es base64 lanza', () => {
    expect(() => componerFichero({ cabecera, cargaB64: '"><script>', textos })).toThrow();
  });
});
