// @vitest-environment node
// T-040 · D1/D4: la copia no se guarda en ningún sitio. El código de `lib/exportaciones` (no sus
// pruebas) no toca Storage, ni el disco, ni el almacenamiento del navegador.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const DIR = __dirname;
const fuentes = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'fixtures-de-prueba.ts',
);

describe('lib/exportaciones no guarda la copia', () => {
  it('hay fuentes que revisar', () => {
    expect(fuentes).toEqual(expect.arrayContaining(['cifrar.ts', 'fichero.ts', 'formato.ts', 'visor-js.ts']));
  });

  it.each(fuentes)('%s no usa .storage, writeFile, localStorage, sessionStorage ni indexedDB', (f) => {
    const codigo = readFileSync(path.join(DIR, f), 'utf8');
    for (const prohibido of [/\.storage\b/, /writeFile/, /localStorage/, /sessionStorage/, /indexedDB/]) {
      expect(codigo, `${f}: ${prohibido}`).not.toMatch(prohibido);
    }
  });
});
