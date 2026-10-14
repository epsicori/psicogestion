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

// Estática (`from '…simulado'`, `import '…simulado'`), dinámica (`import('…simulado')`) o `require`.
const IMPORTA_SIMULADO =
  /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"`][^'"`]*simulado(?:\.ts)?['"`]/;

describe('el detector de importaciones del simulado', () => {
  it.each([
    "import { x } from './simulado';",
    'import {\n  x,\n} from "@/lib/facturacion/simulado"',
    "import './simulado';",
    "export const _x = () => import('./simulado');",
    'const m = await import("@/lib/facturacion/simulado");',
    "const m = require('./simulado');",
  ])('detecta %s', (texto) => {
    expect(IMPORTA_SIMULADO.test(texto)).toBe(true);
  });

  it('no se dispara con otros módulos', () => {
    expect(IMPORTA_SIMULADO.test("import { y } from './registro';")).toBe(false);
    expect(IMPORTA_SIMULADO.test("const m = import('./holded');")).toBe(false);
  });
});

describe('el proveedor simulado es solo de pruebas', () => {
  it('ningún fichero que no sea de prueba lo importa', () => {
    const culpables = CARPETAS.flatMap((c) => ficheros(join(RAIZ, c)))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
      .filter((f) => !f.endsWith('simulado.ts'))
      .filter((f) => IMPORTA_SIMULADO.test(readFileSync(f, 'utf8')));
    expect(culpables).toEqual([]);
  });
});
