import { beforeEach, describe, expect, it, vi } from 'vitest';

// T-046 · Las acciones del editor: validan con el esquema del formulario antes de llamar al núcleo,
// le pasan la sesión y el reloj del servidor, y devuelven solo su resultado.

const supabase = { marca: 'sesion' };
vi.mock('@/lib/supabase/sesion', () => ({
  exigirSesion: async () => ({ supabase, usuario: { id: 'u1', email: 'x@y' } }),
}));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('@/lib/facturacion/registro', () => ({
  proveedorActivo: async () => ({ ficha: { nombre: 'Programa X' } }),
}));
vi.mock('@/lib/cifrado/claves', () => ({ claveDeCifrado: async () => Buffer.alloc(32) }));
const guardarBorrador = vi.fn();
vi.mock('@/lib/economico/borrador', () => ({ guardarBorrador: (...a: unknown[]) => guardarBorrador(...a) }));

const { guardarBorradorAccion, descartarBorradorAccion } = await import('./acciones');

const PAC = '11111111-1111-4111-8111-111111111111';
const BOR = '33333333-3333-4333-8333-333333333333';
const valores = {
  pacienteId: PAC,
  borradorId: null,
  partida: null,
  destinatario: { modo: 'paciente', nombre: '', tipo: 'fisica', nif: '' },
  lineas: [{ cita_id: null, concepto: 'Informe', cantidad: '1', precio: '121,00', regimen_iva: 'general' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  guardarBorrador.mockResolvedValue({ ok: true, borradorId: BOR, numeroVersion: 1 });
});

describe('guardarBorradorAccion', () => {
  it('pasa la entrada en céntimos, la sesión y el reloj; refresca la ficha', async () => {
    expect(await guardarBorradorAccion(valores)).toEqual({ ok: true, borradorId: BOR, numeroVersion: 1 });
    const [deps, entrada] = guardarBorrador.mock.calls[0];
    expect(deps.supabase).toBe(supabase);
    expect(deps.usuario).toEqual({ id: 'u1' });
    expect(deps.ahora()).toBeInstanceOf(Date);
    expect(deps.proveedor()).toBe('Programa X');
    expect(entrada.lineas[0]).toMatchObject({ precio_centimos: 12100, regimen_iva: 'general' });
    expect(revalidatePath).toHaveBeenCalledWith(`/pacientes/${PAC}`);
  });

  it('CA17 · sin régimen, sin concepto o sin precio: validacion, sin llamar al núcleo', async () => {
    for (const cambio of [{ regimen_iva: '' }, { concepto: '' }, { precio: '' }]) {
      const malo = { ...valores, lineas: [{ ...valores.lineas[0], ...cambio }] };
      expect(await guardarBorradorAccion(malo)).toEqual({ ok: false, error: 'validacion' });
    }
    expect(guardarBorrador).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('devuelve el error del núcleo tal cual y no refresca', async () => {
    guardarBorrador.mockResolvedValue({ ok: false, error: 'congelado', programa: 'Programa X' });
    expect(await guardarBorradorAccion(valores)).toEqual({ ok: false, error: 'congelado', programa: 'Programa X' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('descartarBorradorAccion', () => {
  it('descarta conservando, desde la partida', async () => {
    await descartarBorradorAccion({ pacienteId: PAC, borradorId: BOR, partida: 2 });
    expect(guardarBorrador.mock.calls[0][1]).toMatchObject({
      borradorId: BOR,
      partida: 2,
      descartar: true,
      destinatario: { modo: 'conservar' },
    });
  });

  it('sin borrador o sin partida: validacion', async () => {
    expect(await descartarBorradorAccion({ pacienteId: PAC, borradorId: null, partida: 2 })).toEqual({
      ok: false,
      error: 'validacion',
    });
    expect(guardarBorrador).not.toHaveBeenCalled();
  });
});
