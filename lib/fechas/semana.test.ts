import { describe, expect, it } from 'vitest';

import { diasDeSemana, limitesDeSemana } from './semana';

const HORA_MS = 3_600_000;

describe('limitesDeSemana', () => {
  it('empieza en lunes y devuelve instantes', () => {
    // Miércoles cualquiera, lejos de cambios de hora.
    const miercoles = new Date('2026-04-15T13:00:00Z');
    const { inicio, fin } = limitesDeSemana(miercoles, 'Europe/Madrid');

    expect(inicio).toBeInstanceOf(Date);
    expect(fin).toBeInstanceOf(Date);
    // Lunes 13 de abril de 2026, 00:00 en Madrid (UTC+2) = 22:00Z del domingo.
    expect(inicio.getTime()).toBe(new Date('2026-04-12T22:00:00Z').getTime());
    expect(fin.getTime() - inicio.getTime()).toBe(7 * 24 * HORA_MS);
  });

  it('la semana que cruza el cambio de octubre dura 169 horas', () => {
    // El cambio es el domingo 25 de octubre de 2026: la semana que lo cruza
    // empieza el lunes 19.
    const enLaSemana = new Date('2026-10-21T12:00:00Z');
    const { inicio, fin } = limitesDeSemana(enLaSemana, 'Europe/Madrid');

    expect(fin.getTime() - inicio.getTime()).toBe(169 * HORA_MS);
  });

  it('la semana que cruza el salto de marzo dura 167 horas', () => {
    // El salto es el domingo 29 de marzo de 2026.
    const enLaSemana = new Date('2026-03-25T12:00:00Z');
    const { inicio, fin } = limitesDeSemana(enLaSemana, 'Europe/Madrid');

    expect(fin.getTime() - inicio.getTime()).toBe(167 * HORA_MS);
  });

  it('la misma semana en Canarias empieza una hora absoluta más tarde que en Madrid', () => {
    const fecha = new Date('2026-04-15T13:00:00Z');
    const madrid = limitesDeSemana(fecha, 'Europe/Madrid');
    const canarias = limitesDeSemana(fecha, 'Atlantic/Canary');

    expect(canarias.inicio.getTime() - madrid.inicio.getTime()).toBe(HORA_MS);
  });

  it('una semana con 29 de febrero lo contiene entre sus días', () => {
    // 29 de febrero de 2024, jueves: cuarto día de su semana.
    const fecha = new Date('2024-02-29T12:00:00Z');
    const dias = diasDeSemana(fecha, 'Europe/Madrid');

    expect(dias).toHaveLength(7);
    // 00:00 del 29 en Madrid (UTC+1) = 23:00Z del 28.
    expect(dias[3].getTime()).toBe(new Date('2024-02-28T23:00:00Z').getTime());
  });
});

describe('diasDeSemana', () => {
  it('devuelve los siete días empezando en lunes', () => {
    const fecha = new Date('2026-04-15T13:00:00Z');
    const dias = diasDeSemana(fecha, 'Europe/Madrid');

    expect(dias).toHaveLength(7);
    expect(dias[0].getTime()).toBe(new Date('2026-04-12T22:00:00Z').getTime());
    expect(dias[6].getTime()).toBe(new Date('2026-04-18T22:00:00Z').getTime());
  });
});
