// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { esquemaDatosAvisos } from '@/lib/agenda/avisos';

const connection = vi.fn(async () => {});
const obtenerUsuario = vi.fn();
const leerAvisos = vi.fn();
const cookieDescartadas = vi.fn<() => { value: string } | undefined>(() => undefined);

vi.mock('next/server', () => ({ connection: () => connection() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => cookieDescartadas() }),
}));
vi.mock('@/lib/supabase/sesion', () => ({ obtenerUsuario: () => obtenerUsuario() }));
vi.mock('@/lib/citas/avisos', () => ({ leerAvisos: (...a: unknown[]) => leerAvisos(...a) }));

import { GET } from './route';

const UUID = '11111111-1111-4111-8111-111111111111';
const FOTO = {
  ahoraServidor: '2026-10-01T10:00:00.000Z',
  sesiones: [],
  recuento: { nivel1: 0, nivel2: 1, nivel3: 0 },
  notificaciones: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  cookieDescartadas.mockReturnValue(undefined);
  obtenerUsuario.mockResolvedValue({ supabase: {}, usuario: { id: 'u1' } });
  leerAvisos.mockResolvedValue(FOTO);
});

describe('GET /api/avisos', () => {
  it('sin usuario: 401 con cuerpo {} y ninguna lectura', async () => {
    obtenerUsuario.mockResolvedValue({ supabase: {}, usuario: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({});
    expect(leerAvisos).not.toHaveBeenCalled();
  });

  it('pide connection() antes que nada (es de la petición, no del build)', async () => {
    const orden: string[] = [];
    connection.mockImplementation(async () => {
      orden.push('connection');
    });
    obtenerUsuario.mockImplementation(async () => {
      orden.push('usuario');
      return { supabase: {}, usuario: { id: 'u1' } };
    });
    await GET();
    expect(orden).toEqual(['connection', 'usuario']);
  });

  it('con usuario: 200, la forma de DatosAvisos y las franjas descartadas de la cookie', async () => {
    cookieDescartadas.mockReturnValue({ value: `${UUID},no-es-uuid` });
    const res = await GET();
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(esquemaDatosAvisos.safeParse(cuerpo).success).toBe(true);
    expect(cuerpo.descartadas).toEqual([UUID]);
    expect(cuerpo.recuento.nivel2).toBe(1);
  });

  it.each([
    ['las sesiones', { sesiones: null }],
    ['el recuento', { recuento: null }],
    ['las notificaciones', { notificaciones: null }],
  ])('503 si falla la lectura de %s', async (_nombre, roto) => {
    leerAvisos.mockResolvedValue({ ...FOTO, ...roto });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('503 si la lectura lanza', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    leerAvisos.mockRejectedValue(new Error('caída'));
    expect((await GET()).status).toBe(503);
  });

  it.each([
    ['200', () => {}],
    ['401', () => obtenerUsuario.mockResolvedValue({ supabase: {}, usuario: null })],
    ['503', () => leerAvisos.mockResolvedValue({ ...FOTO, recuento: null })],
  ])('en el %s: Cache-Control private, no-store y nunca CORS', async (_nombre, preparar) => {
    preparar();
    const res = await GET();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
