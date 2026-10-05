import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// T-040 · La copia no se guarda en ningún sitio más que en la descarga del navegador: ni en el
// almacenamiento de Supabase, ni en disco del servidor, ni en el almacenamiento local.
const FICHEROS = [
  'acciones-copia.ts',
  'esquemas-copia.ts',
  'dialogo-de-copia.tsx',
  'boton-de-copia.tsx',
  'copia-por-motivo.tsx',
];

describe('fuentes de la copia', () => {
  it.each(FICHEROS)('%s no guarda la copia ni la contraseña', (fichero) => {
    const fuente = readFileSync(join(__dirname, fichero), 'utf8');
    for (const prohibido of ['.storage', 'writeFile', 'localStorage', 'sessionStorage', 'indexedDB', 'console.']) {
      expect(fuente, `${fichero} contiene ${prohibido}`).not.toContain(prohibido);
    }
  });
});
