import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = process.cwd();
const CARPETAS = ['app', 'components', 'lib'];

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === 'node_modules' || nombre === '.next') return [];
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? ficheros(ruta) : [ruta];
  });
}

describe('el proveedor simulado es solo de pruebas', () => {
  it('ningún fichero que no sea de prueba lo importa', () => {
    const culpables = CARPETAS.flatMap((c) => ficheros(join(RAIZ, c)))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
      .filter((f) => !f.endsWith('simulado.ts'))
      .filter((f) => /from\s+['"][^'"]*simulado['"]/.test(readFileSync(f, 'utf8')));
    expect(culpables).toEqual([]);
  });
});
