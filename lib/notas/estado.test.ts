import { describe, expect, it } from 'vitest';

import { estadoDeNota } from './estado';

describe('estadoDeNota (derivado, nunca una columna)', () => {
  it('sin versiones y con borrador: borrador', () => {
    expect(estadoDeNota({ versiones: 0, hayBorrador: true })).toBe('borrador');
  });

  it('una versión y sin borrador: firmada', () => {
    expect(estadoDeNota({ versiones: 1, hayBorrador: false })).toBe('firmada');
  });

  it('más de una versión y sin borrador: modificada', () => {
    expect(estadoDeNota({ versiones: 2, hayBorrador: false })).toBe('modificada');
    expect(estadoDeNota({ versiones: 5, hayBorrador: false })).toBe('modificada');
  });

  it('al menos una versión y con borrador: firmada con cambios', () => {
    expect(estadoDeNota({ versiones: 1, hayBorrador: true })).toBe('firmada_con_cambios');
    expect(estadoDeNota({ versiones: 3, hayBorrador: true })).toBe('firmada_con_cambios');
  });

  it('sin versiones ni borrador no hay nada firmado: se trata como borrador', () => {
    expect(estadoDeNota({ versiones: 0, hayBorrador: false })).toBe('borrador');
  });
});
