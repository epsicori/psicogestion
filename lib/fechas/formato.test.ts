import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatearFechaCorta,
  formatearFechaLarga,
  formatearHora,
  formatearRango,
} from './formato';

// Instante absoluto fijo: 2026-03-29T10:00:00Z. En Europe/Madrid (UTC+2 en
// verano) son las 12:00; en Atlantic/Canary (UTC+1), las 11:00.
const INSTANTE = new Date('2026-03-29T10:00:00Z');

beforeEach(() => {
  // Reloj fijo lejos del instante de prueba: si algo leyera el reloj del
  // sistema, el formateo saldría mal y la prueba lo delataría.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2020-06-15T08:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatearHora', () => {
  it('formatea en la zona pedida, no en la del sistema', () => {
    expect(formatearHora(INSTANTE, 'Europe/Madrid')).toBe('12:00');
  });

  it('Canarias va una hora por detrás de la península al mismo instante', () => {
    expect(formatearHora(INSTANTE, 'Atlantic/Canary')).toBe('11:00');
  });
});

describe('formatearFechaCorta', () => {
  it('usa el formato corto español', () => {
    expect(formatearFechaCorta(INSTANTE, 'Europe/Madrid')).toBe('29/03/2026');
  });

  it('el 29 de febrero existe en año bisiesto', () => {
    const bisiesto = new Date('2024-02-29T12:00:00Z');
    expect(formatearFechaCorta(bisiesto, 'Europe/Madrid')).toBe('29/02/2024');
  });
});

describe('formatearFechaLarga', () => {
  it('nombra día y mes en castellano, desde el locale', () => {
    expect(formatearFechaLarga(INSTANTE, 'Europe/Madrid')).toBe(
      'domingo, 29 de marzo de 2026',
    );
  });
});

describe('formatearRango', () => {
  it('une dos horas con el separador del ticket', () => {
    const inicio = new Date('2026-03-30T08:00:00Z');
    const fin = new Date('2026-03-30T08:50:00Z');
    expect(formatearRango(inicio, fin, 'Europe/Madrid')).toBe('10:00 – 10:50');
  });
});
