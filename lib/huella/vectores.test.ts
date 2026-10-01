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
import { ESQUEMA_VERSION, esquemaSobre } from './sobre';
import vectores from './vectores-congelados.json';

// La cabecera de NVEC/PVEC/EPIVEC en scripts/rls/14-cadena-huellas.sql: genesis-minimo se
// inserta allí como versión de NVEC, así que los nueve llevan esa cabecera (T-012c).
const NVEC = 'f0050001-0000-4000-8000-000000000008';
const PVEC = 'd0050001-0000-4000-8000-000000000008';
const EPIVEC = 'e0050001-0000-4000-8000-000000000008';

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
  it('tiene los nueve vectores del §12 del diseño aprobado (T-012a añade alcance-conjunta)', () => {
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
        'alcance-conjunta',
      ].sort(),
    );
  });

  it.each(vectores as unknown as VectorCongelado[])('reproduce el canónico y la huella de "$nombre"', (vector) => {
    const canonico = canonizar(normalizarNfc(vector.sobre));
    expect(canonico).toBe(vector.canonico);
    expect(huellaGenesis(canonico)).toBe(vector.huella_hex);
    // El congelado describe la era VIGENTE: si sube ESQUEMA_VERSION sin regenerar
    // el JSON, las dos suites de vectores siguen verdes por autoconsistencia y solo
    // lo caza el banco de RLS (T-012a, hallazgo BAJA H8-TS).
    expect((vector.sobre as { esquema_version: number }).esquema_version).toBe(ESQUEMA_VERSION);
  });

  it.each(vectores as unknown as VectorCongelado[])('"$nombre" es un sobre válido de la era vigente (Zod)', (vector) => {
    expect(() => esquemaSobre.parse(normalizarNfc(vector.sobre))).not.toThrow();
  });

  it.each(vectores as unknown as VectorCongelado[])('"$nombre" lleva la cabecera de NVEC (T-012c)', (vector) => {
    const sobre = vector.sobre as Record<string, unknown>;
    expect(sobre.nota_id).toBe(NVEC);
    expect(sobre.paciente_id).toBe(PVEC);
    expect(sobre.episodio_id).toBe(EPIVEC);
    expect(sobre.fecha_sesion).toBe('2026-08-29');
  });

  it('solo alcance-conjunta lleva coprofesional_id no nulo; los otros ocho, null (ADR-072)', () => {
    const conCoprofesional = (vectores as unknown as VectorCongelado[])
      .filter((v) => (v.sobre as Record<string, unknown>).coprofesional_id !== null)
      .map((v) => v.nombre);
    expect(conCoprofesional).toEqual(['alcance-conjunta']);
    for (const v of vectores as unknown as VectorCongelado[]) {
      expect(Object.hasOwn(v.sobre as object, 'coprofesional_id'), v.nombre).toBe(true);
    }
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
