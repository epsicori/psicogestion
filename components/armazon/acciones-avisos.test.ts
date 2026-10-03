import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COOKIE_FRANJAS_DESCARTADAS } from './avisos-constantes';

const U = '11111111-1111-4111-8111-111111111111';
const C1 = '22222222-2222-4222-8222-222222222222';
const C2 = '33333333-3333-4333-8333-333333333333';

// Cadena de consulta de Supabase: cada método devuelve la propia cadena y registra la llamada.
function cadena(resultado: { data?: unknown; error: unknown }) {
  const llamadas: [string, unknown[]][] = [];
  const proxy: Record<string, unknown> = {};
  for (const m of ['update', 'eq', 'is', 'select']) {
    proxy[m] = (...args: unknown[]) => {
      llamadas.push([m, args]);
      return proxy;
    };
  }
  proxy.then = (resolver: (v: unknown) => void) => resolver(resultado);
  return { proxy, llamadas };
}

let consulta = cadena({ error: null });
const from = vi.fn(() => consulta.proxy);
const sesion = { supabase: { from }, usuario: { id: U } };
const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const almacen = { get: vi.fn(), set: vi.fn() };
vi.mock('next/headers', () => ({ cookies: async () => almacen }));

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const acciones = await import('./acciones-avisos');

beforeEach(() => {
  vi.clearAllMocks();
  consulta = cadena({ error: null });
  exigirSesion.mockResolvedValue(sesion);
  almacen.get.mockReturnValue(undefined);
});

describe('descartarFranja', () => {
  it('un id que no es UUID no escribe la cookie', async () => {
    expect(await acciones.descartarFranja('no-es-uuid')).toEqual({ ok: false });
    expect(almacen.set).not.toHaveBeenCalled();
  });

  it('exige sesión', async () => {
    exigirSesion.mockRejectedValue(new Error('sin sesión'));
    await expect(acciones.descartarFranja(C1)).rejects.toThrow('sin sesión');
    expect(almacen.set).not.toHaveBeenCalled();
  });

  it('añade la cita a la cookie de sesión del navegador: sin maxAge ni expires', async () => {
    almacen.get.mockReturnValue({ value: C1 });
    expect(await acciones.descartarFranja(C2)).toEqual({ ok: true });
    expect(almacen.set).toHaveBeenCalledTimes(1);
    const [nombre, valor, opciones] = almacen.set.mock.calls[0];
    expect(nombre).toBe(COOKIE_FRANJAS_DESCARTADAS);
    expect(valor).toBe(`${C1},${C2}`);
    expect(opciones).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(opciones).not.toHaveProperty('maxAge');
    expect(opciones).not.toHaveProperty('expires');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('marcarNotificacionLeida', () => {
  it('un id que no es UUID se rechaza sin llamar a Supabase', async () => {
    const r = await acciones.marcarNotificacionLeida('x');
    expect(r).toEqual({ ok: false });
    expect(from).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('marca solo esa y solo si no estaba leída, y revalida el layout', async () => {
    const r = await acciones.marcarNotificacionLeida(C1);
    expect(r).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith('notificaciones');
    expect(consulta.llamadas).toContainEqual(['eq', ['id', C1]]);
    expect(consulta.llamadas).toContainEqual(['is', ['leida_en', null]]);
    const update = consulta.llamadas.find(([m]) => m === 'update');
    expect(update?.[1][0]).toHaveProperty('leida_en');
    expect(Object.keys(update?.[1][0] as object)).toEqual(['leida_en']);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('si la base falla devuelve ok: false', async () => {
    consulta = cadena({ error: { code: '42501', message: 'x' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await acciones.marcarNotificacionLeida(C1);
    expect(r).toEqual({ ok: false });
  });
});

describe('marcarTodasLeidas', () => {
  it('marca las del usuario sin leer y revalida el layout', async () => {
    const r = await acciones.marcarTodasLeidas();
    expect(r).toEqual({ ok: true });
    expect(consulta.llamadas).toContainEqual(['eq', ['perfil_id', U]]);
    expect(consulta.llamadas).toContainEqual(['is', ['leida_en', null]]);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('exige sesión', async () => {
    exigirSesion.mockRejectedValue(new Error('sin sesión'));
    await expect(acciones.marcarTodasLeidas()).rejects.toThrow('sin sesión');
    expect(from).not.toHaveBeenCalled();
  });
});
