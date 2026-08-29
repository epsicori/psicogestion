import { describe, expect, it } from 'vitest';

import { clasificarHoraLocal } from './anomalias';

const HORA_MS = 3_600_000;

describe('clasificarHoraLocal', () => {
  it('una hora corriente es normal y tiene un único candidato', () => {
    const resultado = clasificarHoraLocal('2026-04-15', '10:30', 'Europe/Madrid');

    expect(resultado.clasificacion).toBe('normal');
    expect(resultado.candidatos).toHaveLength(1);
    // 10:30 en Madrid (UTC+2) = 08:30Z.
    expect(resultado.candidatos[0].toISOString()).toBe('2026-04-15T08:30:00.000Z');
  });

  it('las 02:30 del 29 de marzo de 2026 no existen en Europe/Madrid', () => {
    const resultado = clasificarHoraLocal('2026-03-29', '02:30', 'Europe/Madrid');

    expect(resultado.clasificacion).toBe('inexistente');
    expect(resultado.candidatos).toHaveLength(0);
  });

  it('las 02:30 del 25 de octubre de 2026 ocurren dos veces en Europe/Madrid', () => {
    const resultado = clasificarHoraLocal('2026-10-25', '02:30', 'Europe/Madrid');

    expect(resultado.clasificacion).toBe('ambigua');
    expect(resultado.candidatos).toHaveLength(2);
    // Dos instantes separados exactamente por una hora.
    const separacion =
      resultado.candidatos[1].getTime() - resultado.candidatos[0].getTime();
    expect(separacion).toBe(HORA_MS);
    // Primera ocurrencia con UTC+2, segunda con UTC+1.
    expect(resultado.candidatos[0].toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(resultado.candidatos[1].toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });

  it('la ambigüedad de octubre es el mismo instante absoluto en Madrid y en Canarias', () => {
    // Canarias va una hora detrás: su hora ambigua es la 01:30, no las 02:30.
    // Las primeras ocurrencias coinciden al milisegundo en las dos zonas.
    const madrid = clasificarHoraLocal('2026-10-25', '02:30', 'Europe/Madrid');
    const canarias = clasificarHoraLocal('2026-10-25', '01:30', 'Atlantic/Canary');

    expect(canarias.clasificacion).toBe('ambigua');
    expect(canarias.candidatos).toHaveLength(2);
    expect(canarias.candidatos[0].getTime()).toBe(madrid.candidatos[0].getTime());
    expect(canarias.candidatos[1].getTime()).toBe(madrid.candidatos[1].getTime());
  });

  it('las 02:30 del 29 de febrero de 2024 sí existen (año bisiesto)', () => {
    const resultado = clasificarHoraLocal('2024-02-29', '02:30', 'Europe/Madrid');

    expect(resultado.clasificacion).toBe('normal');
  });

  it('rechaza entradas mal formadas', () => {
    expect(() => clasificarHoraLocal('29/03/2026', '02:30', 'Europe/Madrid')).toThrow();
    expect(() => clasificarHoraLocal('2026-03-29', '2:30', 'Europe/Madrid')).toThrow();
  });
});
