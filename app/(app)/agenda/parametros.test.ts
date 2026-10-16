import { describe, expect, it } from 'vitest';

import { hrefAgenda, leerParametros } from './parametros';

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
    expect(leerParametros({ vista: 'trimestre' }).vista).toBe('semana');
  });

  it('vista=anio es el año; año, ANIO, repetido o vacío caen en la semana (T-047 CA6)', () => {
    expect(leerParametros({ vista: 'anio' }).vista).toBe('anio');
    expect(leerParametros({ vista: 'año' }).vista).toBe('semana');
    expect(leerParametros({ vista: 'ANIO' }).vista).toBe('semana');
    expect(leerParametros({ vista: ['anio', 'anio'] }).vista).toBe('semana');
    expect(leerParametros({ vista: '' }).vista).toBe('semana');
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

describe('hrefAgenda', () => {
  it('pone vista y, si los hay, fecha, centro y profesional, en ese orden', () => {
    expect(hrefAgenda({ vista: 'anio', fecha: null, centro: null, profesional: null })).toBe('/agenda?vista=anio');
    expect(hrefAgenda({ vista: 'semana', fecha: '2026-03-10', centro: null, profesional: null })).toBe(
      '/agenda?vista=semana&fecha=2026-03-10',
    );
    expect(hrefAgenda({ vista: 'mes', fecha: '2026-03-10', centro: UUID, profesional: UUID })).toBe(
      `/agenda?vista=mes&fecha=2026-03-10&centro=${UUID}&profesional=${UUID}`,
    );
    expect(hrefAgenda({ vista: 'mes', fecha: null, centro: 'todos', profesional: UUID })).toBe(
      `/agenda?vista=mes&centro=todos&profesional=${UUID}`,
    );
  });
});
