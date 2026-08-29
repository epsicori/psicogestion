import { describe, expect, it } from 'vitest';

import { duracionEnMinutos, estaEnCurso, seSolapan } from './intervalos';

// Convención semiabierta [inicio, fin): las citas de 10:00-10:50 y 10:50-11:40.
const citaA = {
  inicio: new Date('2026-04-15T08:00:00Z'),
  fin: new Date('2026-04-15T08:50:00Z'),
};
const citaB = {
  inicio: new Date('2026-04-15T08:50:00Z'),
  fin: new Date('2026-04-15T09:40:00Z'),
};

describe('duracionEnMinutos', () => {
  it('cuenta minutos entre instantes', () => {
    expect(duracionEnMinutos(citaA.inicio, citaA.fin)).toBe(50);
  });
});

describe('seSolapan', () => {
  it('dos citas consecutivas NO se solapan (intervalo semiabierto)', () => {
    expect(seSolapan(citaA, citaB)).toBe(false);
    expect(seSolapan(citaB, citaA)).toBe(false);
  });

  it('un minuto de coincidencia ya es solape', () => {
    const solapada = {
      inicio: new Date('2026-04-15T08:49:00Z'),
      fin: new Date('2026-04-15T09:00:00Z'),
    };
    expect(seSolapan(citaA, solapada)).toBe(true);
  });

  it('una cita dentro de otra es solape', () => {
    const dentro = {
      inicio: new Date('2026-04-15T08:10:00Z'),
      fin: new Date('2026-04-15T08:20:00Z'),
    };
    expect(seSolapan(citaA, dentro)).toBe(true);
  });
});

describe('estaEnCurso', () => {
  const ahoraDentro = new Date('2026-04-15T08:25:00Z');

  it('dentro del intervalo, en curso', () => {
    expect(estaEnCurso(citaA.inicio, citaA.fin, ahoraDentro)).toBe(true);
  });

  it('antes y después, no en curso', () => {
    expect(estaEnCurso(citaA.inicio, citaA.fin, new Date('2026-04-15T07:59:00Z'))).toBe(false);
    expect(estaEnCurso(citaA.inicio, citaA.fin, new Date('2026-04-15T08:51:00Z'))).toBe(false);
  });

  it('los bordes siguen la convención semiabierta', () => {
    expect(estaEnCurso(citaA.inicio, citaA.fin, citaA.inicio)).toBe(true);
    expect(estaEnCurso(citaA.inicio, citaA.fin, citaA.fin)).toBe(false);
  });
});
