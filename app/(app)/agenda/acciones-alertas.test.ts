import { beforeEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';

// Cadena de consulta de Supabase: registra cada llamada y resuelve con el resultado fijado.
function cadena(resultado: { data?: unknown; error: unknown }) {
  const llamadas: [string, unknown[]][] = [];
  const proxy: Record<string, unknown> = {};
  for (const m of ['update', 'eq', 'neq', 'is', 'select']) {
    proxy[m] = (...args: unknown[]) => {
      llamadas.push([m, args]);
      return proxy;
    };
  }
  proxy.then = (resolver: (v: unknown) => void) => resolver(resultado);
  return { proxy, llamadas };
}

let consulta = cadena({ data: [{ id: A }], error: null });
const from = vi.fn(() => consulta.proxy);
const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { resolverAlerta } = await import('./acciones-alertas');

function datos(alertaId: string) {
  const f = new FormData();
  f.set('alertaId', alertaId);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  consulta = cadena({ data: [{ id: A }], error: null });
  exigirSesion.mockResolvedValue({ supabase: { from }, usuario: { id: 'u1' } });
});

describe('resolverAlerta', () => {
  it('un alertaId que no es UUID devuelve invalida sin tocar Supabase', async () => {
    expect(await resolverAlerta(null, datos('x'))).toEqual({ ok: false, error: 'invalida' });
    expect(from).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('exige sesión antes de nada', async () => {
    exigirSesion.mockRejectedValue(new Error('sin sesión'));
    await expect(resolverAlerta(null, datos(A))).rejects.toThrow('sin sesión');
    expect(from).not.toHaveBeenCalled();
  });

  it('cero filas devuelve no_permitida y no revalida', async () => {
    consulta = cadena({ data: [], error: null });
    expect(await resolverAlerta(null, datos(A))).toEqual({ ok: false, error: 'no_permitida' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('42501 devuelve no_permitida', async () => {
    consulta = cadena({ data: null, error: { code: '42501', message: 'x' } });
    expect(await resolverAlerta(null, datos(A))).toEqual({ ok: false, error: 'no_permitida' });
  });

  it('otro error devuelve fallo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    consulta = cadena({ data: null, error: { code: '08006', message: 'x' } });
    expect(await resolverAlerta(null, datos(A))).toEqual({ ok: false, error: 'fallo' });
  });

  it('si va bien: ok, y revalida la agenda y el layout', async () => {
    expect(await resolverAlerta(null, datos(A))).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/agenda');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('la consulta acota a esa alerta, abierta y que no sea nota_sin_firmar', async () => {
    await resolverAlerta(null, datos(A));
    expect(from).toHaveBeenCalledWith('alertas_documentacion');
    expect(consulta.llamadas).toContainEqual(['eq', ['id', A]]);
    expect(consulta.llamadas).toContainEqual(['eq', ['estado', 'abierta']]);
    expect(consulta.llamadas).toContainEqual(['neq', ['tipo', 'nota_sin_firmar']]);
    const update = consulta.llamadas.find(([m]) => m === 'update');
    expect(update?.[1][0]).toMatchObject({ estado: 'resuelta' });
  });
});
