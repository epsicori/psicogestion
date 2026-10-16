// T-046 · Cierra el lazo entre los vectores del sobre del borrador (TypeScript) y su copia literal
// en el banco (scripts/rls/32-editor-borrador.sql, bloque V). El banco comprueba que cada literal
// es lo que serializa la base y que sella la huella congelada; esta prueba comprueba que cada
// literal es, byte a byte, el del JSON que el constructor de TypeScript reproduce.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import vectores from './vectores-borrador.json';

type Vector = { nombre: string; contenido_canonico: string; huella_hex: string };

const RUTA_SQL = path.join(process.cwd(), 'scripts', 'rls', '32-editor-borrador.sql');

function extraerPares(sql: string): Array<{ canonico: string; hex: string }> {
  const patron = /\$vec\$([\s\S]*?)\$vec\$[\s\S]*?decode\('([0-9a-f]{64})',\s*'hex'\)/g;
  const pares: Array<{ canonico: string; hex: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = patron.exec(sql)) !== null) pares.push({ canonico: m[1], hex: m[2] });
  return pares;
}

describe('scripts/rls/32-editor-borrador.sql · los vectores del sobre del borrador', () => {
  const pares = extraerPares(readFileSync(RUTA_SQL, 'utf8'));
  const lista = vectores as Vector[];

  it('el banco trae los seis, uno por vector del JSON', () => {
    expect(pares).toHaveLength(lista.length);
    expect(new Set(pares.map((p) => p.hex))).toEqual(new Set(lista.map((v) => v.huella_hex)));
  });

  it('cada literal del banco es, byte a byte, el contenido canónico del JSON con esa huella', () => {
    const porHuella = new Map(lista.map((v) => [v.huella_hex, v]));
    for (const par of pares) {
      const vector = porHuella.get(par.hex);
      expect(vector, `la huella ${par.hex} del banco no está en el JSON`).toBeDefined();
      expect(par.canonico).toBe(vector!.contenido_canonico);
    }
  });
});
