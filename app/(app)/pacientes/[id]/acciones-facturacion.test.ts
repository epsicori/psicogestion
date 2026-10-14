import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const maybeSingle = vi.fn();
const supabase = {
  rpc: (...a: unknown[]) => rpc(...a),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }) }),
};
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: async () => ({ supabase, usuario: { id: 'u1' } }) }));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { prepararBorradorEnProveedor } = await import('./acciones-facturacion');

const ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
  maybeSingle.mockResolvedValue({ data: { paciente_id: 'pac-1' } });
});

describe('prepararBorradorEnProveedor', () => {
  it('encola y refresca la ficha del paciente', async () => {
    expect(await prepararBorradorEnProveedor(ID)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('encolar_envio_borrador', { p_borrador_id: ID });
    expect(revalidatePath).toHaveBeenCalledWith('/pacientes/pac-1');
  });

  it('un id que no es UUID no llega a la base', async () => {
    expect(await prepararBorradorEnProveedor('no-es-uuid')).toEqual({ error: 'fallo' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: '42501', message: 'x' }, 'sin_permiso'],
    [{ code: '23514', message: 'No se puede preparar: no hay programa de facturación conectado.' }, 'sin_programa'],
    [{ code: '23514', message: 'El borrador no tiene una versión que se pueda preparar.' }, 'no_preparable'],
    [{ code: '23514', message: 'otra cosa' }, 'fallo'],
    [{ code: 'XX000', message: 'no hay programa' }, 'fallo'],
  ])('el error %j sale como %s y no refresca', async (error, esperado) => {
    rpc.mockResolvedValue({ error });
    expect(await prepararBorradorEnProveedor(ID)).toEqual({ error: esperado });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
