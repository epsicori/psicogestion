import { describe, expect, it, vi } from 'vitest';

import { leerDensidadAnual, listarProfesionalesDelAnio } from './densidad';
import type { Sesion } from './tipos';

type Respuesta = { data: unknown; error: unknown };

function sesionFalsa(rpc: Record<string, Respuesta>) {
  const llamada = vi.fn((nombre: string) => Promise.resolve(rpc[nombre] ?? { data: null, error: null }));
  const sesion = {
    supabase: { rpc: llamada } as unknown as Sesion['supabase'],
    usuario: { id: 'u1' } as unknown as Sesion['usuario'],
  };
  return { sesion, llamada };
}

const CONSULTA = {
  desde: new Date('2025-12-31T23:00:00.000Z'),
  hasta: new Date('2026-12-31T23:00:00.000Z'),
  zona: 'Europe/Madrid',
  centroId: null as string | null,
};

describe('leerDensidadAnual', () => {
  it('llama a agenda_densidad_anual con los cinco parámetros y devuelve cadenas y números', async () => {
    const { sesion, llamada } = sesionFalsa({
      agenda_densidad_anual: {
        data: [
          { dia: '2026-03-03', recuento: 7 },
          { dia: '2026-03-04', recuento: 1 },
        ],
        error: null,
      },
    });
    const r = await leerDensidadAnual(sesion, { ...CONSULTA, centroId: 'c1', profesionalId: 'p1' });
    expect(llamada).toHaveBeenCalledTimes(1);
    expect(llamada).toHaveBeenCalledWith('agenda_densidad_anual', {
      p_desde: '2025-12-31T23:00:00.000Z',
      p_hasta: '2026-12-31T23:00:00.000Z',
      p_zona: 'Europe/Madrid',
      p_centro_id: 'c1',
      p_profesional_id: 'p1',
    });
    expect(r).toEqual({
      ok: true,
      dias: [
        { dia: '2026-03-03', recuento: 7 },
        { dia: '2026-03-04', recuento: 1 },
      ],
    });
  });

  it('sin filtros no manda nulos (undefined) y un data nulo es una lista vacía', async () => {
    const { sesion, llamada } = sesionFalsa({ agenda_densidad_anual: { data: null, error: null } });
    const r = await leerDensidadAnual(sesion, { ...CONSULTA, profesionalId: null });
    const args = llamada.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_centro_id).toBeUndefined();
    expect(args.p_profesional_id).toBeUndefined();
    expect(r).toEqual({ ok: true, dias: [] });
  });

  it('un 22023 de la base es parametro_invalido; otro error, desconocido; nunca lanza', async () => {
    const a = await leerDensidadAnual(
      sesionFalsa({ agenda_densidad_anual: { data: null, error: { code: '22023', message: 'x' } } }).sesion,
      { ...CONSULTA, profesionalId: null },
    );
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.motivo).toBe('parametro_invalido');
    const b = await leerDensidadAnual(
      sesionFalsa({ agenda_densidad_anual: { data: null, error: { code: 'XX000', message: 'x' } } }).sesion,
      { ...CONSULTA, profesionalId: null },
    );
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.motivo).toBe('desconocido');
  });
});

describe('listarProfesionalesDelAnio', () => {
  it('llama a agenda_profesionales_anuales y devuelve id y nombre', async () => {
    const { sesion, llamada } = sesionFalsa({
      agenda_profesionales_anuales: {
        data: [
          { profesional_id: 'p1', profesional_nombre: 'Laura Martín' },
          { profesional_id: 'p2', profesional_nombre: null },
        ],
        error: null,
      },
    });
    const r = await listarProfesionalesDelAnio(sesion, { ...CONSULTA, centroId: 'c1' });
    expect(llamada).toHaveBeenCalledWith('agenda_profesionales_anuales', {
      p_desde: '2025-12-31T23:00:00.000Z',
      p_hasta: '2026-12-31T23:00:00.000Z',
      p_zona: 'Europe/Madrid',
      p_centro_id: 'c1',
    });
    expect(r).toEqual({
      ok: true,
      profesionales: [
        { id: 'p1', nombre: 'Laura Martín' },
        { id: 'p2', nombre: null },
      ],
    });
  });

  it('un error de la base es un fallo con mensaje', async () => {
    const r = await listarProfesionalesDelAnio(
      sesionFalsa({ agenda_profesionales_anuales: { data: null, error: { code: '22023', message: 'x' } } }).sesion,
      CONSULTA,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje.length).toBeGreaterThan(0);
  });
});
