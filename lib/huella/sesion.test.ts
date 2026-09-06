import { describe, expect, it } from 'vitest';

import { calcularRedactadaEnSesion } from './sesion';

const inicio = new Date('2026-08-29T10:00:00.000Z');
const fin = new Date('2026-08-29T10:50:00.000Z');
const margenMinutos = 5;

describe('calcularRedactadaEnSesion', () => {
  it('cierto cuando abierta y firmada caen dentro de la ventana', () => {
    expect(
      calcularRedactadaEnSesion({
        abiertaEn: new Date('2026-08-29T10:05:00.000Z'),
        firmadaEn: new Date('2026-08-29T10:40:00.000Z'),
        ventanaCita: { inicio, fin },
        margenMinutos,
      }),
    ).toBe(true);
  });

  it('cierto justo en el borde del margen (inicio - margen, fin + margen)', () => {
    expect(
      calcularRedactadaEnSesion({
        abiertaEn: new Date('2026-08-29T09:55:00.000Z'), // inicio - 5min exacto
        firmadaEn: new Date('2026-08-29T10:55:00.000Z'), // fin + 5min exacto
        ventanaCita: { inicio, fin },
        margenMinutos,
      }),
    ).toBe(true);
  });

  it('falso si se abre un minuto antes del margen', () => {
    expect(
      calcularRedactadaEnSesion({
        abiertaEn: new Date('2026-08-29T09:54:00.000Z'),
        firmadaEn: new Date('2026-08-29T10:40:00.000Z'),
        ventanaCita: { inicio, fin },
        margenMinutos,
      }),
    ).toBe(false);
  });

  it('falso si se firma un minuto después del margen', () => {
    expect(
      calcularRedactadaEnSesion({
        abiertaEn: new Date('2026-08-29T10:05:00.000Z'),
        firmadaEn: new Date('2026-08-29T10:56:00.000Z'),
        ventanaCita: { inicio, fin },
        margenMinutos,
      }),
    ).toBe(false);
  });

  it('falso sin cita (ventanaCita null)', () => {
    expect(
      calcularRedactadaEnSesion({
        abiertaEn: new Date('2026-08-29T10:05:00.000Z'),
        firmadaEn: new Date('2026-08-29T10:40:00.000Z'),
        ventanaCita: null,
        margenMinutos,
      }),
    ).toBe(false);
  });

  it('falso con margen nulo aunque haya ventana', () => {
    expect(
      calcularRedactadaEnSesion({
        abiertaEn: new Date('2026-08-29T10:05:00.000Z'),
        firmadaEn: new Date('2026-08-29T10:40:00.000Z'),
        ventanaCita: { inicio, fin },
        margenMinutos: null,
      }),
    ).toBe(false);
  });

  it('falso si se abre antes de la ventana y se firma después, fuera de todo margen razonable', () => {
    expect(
      calcularRedactadaEnSesion({
        abiertaEn: new Date('2026-08-29T00:00:00.000Z'),
        firmadaEn: new Date('2026-08-29T23:59:00.000Z'),
        ventanaCita: { inicio, fin },
        margenMinutos: 1,
      }),
    ).toBe(false);
  });
});
