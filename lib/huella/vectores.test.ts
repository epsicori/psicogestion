// T-005 · El vector de regresión congelado (§12 del diseño aprobado) reproduce
// sus huellas byte a byte. Si un cambio de dependencia (Node, ICU) mueve una
// huella, falla aquí — no en producción seis meses después.
//
// `huella_hex` es SHA-256(utf8(canónico) || 32 bytes cero): la huella real del
// primer eslabón, así que este vector no congela solo la canonicalización
// sino el encadenado completo. El SHA-256 de esta prueba vive solo aquí, en
// una prueba: la aplicación nunca calcula huellas (eso es pgcrypto en la
// base, §6).
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { canonizar, type ValorJson } from './jcs';
import { normalizarNfc } from './nfc';
import vectores from './vectores-congelados.json';

interface VectorCongelado {
  nombre: string;
  porque: string;
  sobre: ValorJson;
  canonico: string;
  huella_hex: string;
}

function huellaGenesis(canonico: string): string {
  const cero32 = Buffer.alloc(32);
  const bytes = Buffer.from(canonico, 'utf8');
  return createHash('sha256').update(Buffer.concat([bytes, cero32])).digest('hex');
}

describe('vectores-congelados.json', () => {
  it('tiene los ocho vectores del §12 del diseño aprobado', () => {
    expect((vectores as unknown as VectorCongelado[]).map((v) => v.nombre).sort()).toEqual(
      [
        'genesis-minimo',
        'acentos-nfd',
        'acentos-nfc',
        'emoji-y-tipograficas',
        'reservadas-nulas',
        'reservadas-vacias',
        'en-sesion',
        'control-y-exponente',
      ].sort(),
    );
  });

  it.each(vectores as unknown as VectorCongelado[])('reproduce el canónico y la huella de "$nombre"', (vector) => {
    const canonico = canonizar(normalizarNfc(vector.sobre));
    expect(canonico).toBe(vector.canonico);
    expect(huellaGenesis(canonico)).toBe(vector.huella_hex);
  });

  it('acentos-nfd y acentos-nfc dan EXACTAMENTE la misma huella', () => {
    const nfd = (vectores as unknown as VectorCongelado[]).find((v) => v.nombre === 'acentos-nfd')!;
    const nfc = (vectores as unknown as VectorCongelado[]).find((v) => v.nombre === 'acentos-nfc')!;
    expect(nfd.huella_hex).toBe(nfc.huella_hex);
    expect(nfd.canonico).toBe(nfc.canonico);
  });

  it('reservadas-nulas y reservadas-vacias dan huellas DISTINTAS', () => {
    const nulas = (vectores as unknown as VectorCongelado[]).find((v) => v.nombre === 'reservadas-nulas')!;
    const vacias = (vectores as unknown as VectorCongelado[]).find((v) => v.nombre === 'reservadas-vacias')!;
    expect(nulas.huella_hex).not.toBe(vacias.huella_hex);
  });
});
