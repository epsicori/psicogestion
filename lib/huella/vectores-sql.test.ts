// T-005 · Cierra el lazo entre el vector congelado (TypeScript) y su copia literal en
// SQL (scripts/rls/14-cadena-huellas.sql, §11.4 del diseño aprobado): sin esta prueba, la
// copia manual entre los dos ficheros se desincroniza el primer día y nadie se entera
// hasta que el banco de RLS falle por un motivo que no tiene nada que ver.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import vectores from './vectores-congelados.json';

interface VectorCongelado {
  nombre: string;
  canonico: string;
  huella_hex: string;
}

const RUTA_SQL = path.join(process.cwd(), 'scripts', 'rls', '14-cadena-huellas.sql');

function extraerParesLiterales(sql: string): Array<{ canonico: string; hex: string }> {
  const patron = /\$vec\$([\s\S]*?)\$vec\$[\s\S]*?decode\('([0-9a-f]{64})',\s*'hex'\)/g;
  const pares: Array<{ canonico: string; hex: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = patron.exec(sql)) !== null) {
    pares.push({ canonico: m[1], hex: m[2] });
  }
  return pares;
}

describe('scripts/rls/14-cadena-huellas.sql · pares literales del vector congelado', () => {
  const sql = readFileSync(RUTA_SQL, 'utf8');
  const pares = extraerParesLiterales(sql);

  it('el módulo SQL trae al menos tres pares literales (§11.4)', () => {
    expect(pares.length).toBeGreaterThanOrEqual(3);
  });

  it('cada par literal del SQL está, idéntico, en vectores-congelados.json', () => {
    const porHuella = new Map((vectores as VectorCongelado[]).map((v) => [v.huella_hex, v]));
    for (const par of pares) {
      const vector = porHuella.get(par.hex);
      expect(vector, `ninguna huella "${par.hex}" del SQL aparece en el JSON congelado`).toBeDefined();
      expect(par.canonico).toBe(vector!.canonico);
    }
  });
});
