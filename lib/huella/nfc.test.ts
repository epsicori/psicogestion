import { describe, expect, it } from 'vitest';

import { canonizar } from './jcs';
import { ErrorNormalizacionNfc, normalizarNfc } from './nfc';

describe('normalizarNfc', () => {
  it('normaliza valores de texto a NFC', () => {
    const nfd = 'e' + '́'; // "é" descompuesta
    const nfc = 'é'; // "é" precompuesta
    expect(normalizarNfc(nfd)).toBe(nfc);
  });

  it('el mismo texto en NFD y en NFC produce el mismo canónico tras normalizar', () => {
    const nfd = { texto: 'e' + '́' };
    const nfc = { texto: 'é' };
    expect(canonizar(normalizarNfc(nfd))).toBe(canonizar(normalizarNfc(nfc)));
  });

  it('normaliza también las claves, no solo los valores', () => {
    const claveNfd = 'e' + '́';
    const objeto = { [claveNfd]: 1 };
    const normalizado = normalizarNfc(objeto) as Record<string, unknown>;
    expect(Object.keys(normalizado)).toEqual(['é']);
  });

  it('recorre arrays y objetos anidados', () => {
    const nfd = 'e' + '́';
    const entrada = { lista: [{ texto: nfd }, { texto: 'ok' }] };
    const normalizado = normalizarNfc(entrada) as { lista: Array<{ texto: string }> };
    expect(normalizado.lista[0].texto).toBe('é');
  });

  it('deja pasar null, booleanos y números sin tocar', () => {
    expect(normalizarNfc(null)).toBeNull();
    expect(normalizarNfc(true)).toBe(true);
    expect(normalizarNfc(42)).toBe(42);
  });

  it('dos claves que colisionan al normalizar a NFC es un error, no una fusión silenciosa', () => {
    const claveNfd = 'e' + '́'; // normaliza a "é"
    const claveNfc = 'é';
    const objeto = { [claveNfd]: 1, [claveNfc]: 2 };
    expect(Object.keys(objeto)).toHaveLength(2); // dos claves distintas en origen
    expect(() => normalizarNfc(objeto)).toThrow(ErrorNormalizacionNfc);
  });

  // Hallazgo ALTA de la revisión con Opus del 30-08-2026: `typeof new Date() === 'object'`
  // y `Object.keys(new Date()) === []`, así que sin una comprobación explícita de objeto
  // plano AQUÍ, un Date/Map/Set se vaciaba en `{}` en silencio antes de que jcs.ts pudiera
  // rechazarlo — el guarda de jcs.ts nunca se disparaba porque ya no quedaba nada que ver.
  it('lanza ante un Date en vez de vaciarlo en {} (no delega el rechazo en jcs.ts)', () => {
    expect(() => normalizarNfc(new Date() as unknown as ReturnType<typeof normalizarNfc>)).toThrow(
      ErrorNormalizacionNfc,
    );
  });

  it('lanza ante un Map anidado dentro de un array, con la ruta del culpable', () => {
    let error: ErrorNormalizacionNfc | undefined;
    try {
      normalizarNfc({ lista: [1, new Map()] } as unknown as ReturnType<typeof normalizarNfc>);
    } catch (e) {
      error = e as ErrorNormalizacionNfc;
    }
    expect(error).toBeInstanceOf(ErrorNormalizacionNfc);
    expect(error?.ruta).toBe('$.lista[1]');
  });

  it('lanza ante un Set', () => {
    expect(() => normalizarNfc(new Set() as unknown as ReturnType<typeof normalizarNfc>)).toThrow(
      ErrorNormalizacionNfc,
    );
  });
});
