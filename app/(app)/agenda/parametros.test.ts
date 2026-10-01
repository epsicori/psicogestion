import { describe, expect, it } from 'vitest';

import { leerParametros } from './parametros';

const UUID = '6f1c1b4e-2a1d-4c7e-9a3b-0d2e5f8a9b10';

describe('leerParametros', () => {
  it('sin nada: semana, sin fecha, sin filtros', () => {
    expect(leerParametros({})).toEqual({ vista: 'semana', fecha: null, centro: null, profesional: null });
  });

  it('lee los cuatro cuando valen', () => {
    expect(
      leerParametros({ vista: 'mes', fecha: '2026-09-24', centro: UUID, profesional: UUID }),
    ).toEqual({ vista: 'mes', fecha: '2026-09-24', centro: UUID, profesional: UUID });
  });

  it('una vista desconocida es la semana', () => {
    expect(leerParametros({ vista: 'anio' }).vista).toBe('semana');
  });

  it('el 30 de febrero es «sin fecha», nunca el 2 de marzo', () => {
    expect(leerParametros({ fecha: '2026-02-30' }).fecha).toBeNull();
    expect(leerParametros({ fecha: '24-09-2026' }).fecha).toBeNull();
    expect(leerParametros({ fecha: '2026-9-4' }).fecha).toBeNull();
  });

  it('el centro vale como uuid o «todos»; otra cosa se ignora', () => {
    expect(leerParametros({ centro: 'todos' }).centro).toBe('todos');
    expect(leerParametros({ centro: 'sede-norte' }).centro).toBeNull();
    expect(leerParametros({ centro: `${UUID}' or 1=1` }).centro).toBeNull();
  });

  it('el profesional solo vale como uuid; «todos» no es un profesional', () => {
    expect(leerParametros({ profesional: 'todos' }).profesional).toBeNull();
    expect(leerParametros({ profesional: 'Ana' }).profesional).toBeNull();
  });

  it('un parámetro repetido llega como lista y se ignora, sin lanzar', () => {
    expect(leerParametros({ vista: ['mes', 'semana'], fecha: ['2026-09-24'] })).toEqual({
      vista: 'semana',
      fecha: null,
      centro: null,
      profesional: null,
    });
  });
});
