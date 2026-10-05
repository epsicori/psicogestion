import { beforeEach, describe, expect, it, vi } from 'vitest';

// T-040 · Las acciones de la copia solo envuelven `lib/exportaciones/servidor.ts`: sesión, Zod,
// servidor. Ninguna recibe la contraseña: el esquema estricto la rechaza si se cuela.

const sesion = { supabase: {}, usuario: { id: 'u1' } };
const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const cabeceras = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'prueba/1' });
vi.mock('next/headers', () => ({ headers: async () => cabeceras }));

const servidor = { pedirCopiaDeNota: vi.fn(), registrarFichero: vi.fn() };
vi.mock('@/lib/exportaciones/servidor', () => servidor);

const acciones = await import('./acciones-copia');

const P = '11111111-1111-4111-8111-111111111111';
const N = '22222222-2222-4222-8222-222222222222';
const E = '33333333-3333-4333-8333-333333333333';
const HUELLA = 'b'.repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  exigirSesion.mockResolvedValue(sesion);
});

describe('pedirCopiaDeNota', () => {
  const entrada = { pacienteId: P, notaId: N, motivo: null, referencia: null };

  it('con una entrada válida delega con la sesión, la entrada y el contexto de la petición', async () => {
    servidor.pedirCopiaDeNota.mockResolvedValue({ ok: true, marca: 1 });
    const r = await acciones.pedirCopiaDeNota(entrada);
    expect(r).toEqual({ ok: true, marca: 1 });
    expect(servidor.pedirCopiaDeNota).toHaveBeenCalledWith(sesion, entrada, { ip: '203.0.113.7', agente: 'prueba/1' });
  });
  it('recorta la referencia antes de mandarla', async () => {
    servidor.pedirCopiaDeNota.mockResolvedValue({ ok: true });
    await acciones.pedirCopiaDeNota({ ...entrada, motivo: 'traspaso_caso', referencia: '  EXP-12 ' });
    expect(servidor.pedirCopiaDeNota.mock.calls[0][1]).toEqual({ ...entrada, motivo: 'traspaso_caso', referencia: 'EXP-12' });
  });
  it('con una contraseña colada devuelve error y no llama al servidor', async () => {
    const r = await acciones.pedirCopiaDeNota({ ...entrada, contrasena: 'caballo-bateria-grapa' } as never);
    expect(r).toEqual({ ok: false, motivo: 'error' });
    expect(servidor.pedirCopiaDeNota).not.toHaveBeenCalled();
  });
  it('con una entrada inválida devuelve error y no llama al servidor', async () => {
    const r = await acciones.pedirCopiaDeNota({ ...entrada, notaId: 'x' });
    expect(r).toEqual({ ok: false, motivo: 'error' });
    expect(servidor.pedirCopiaDeNota).not.toHaveBeenCalled();
  });
  it('exige sesión ANTES de validar', async () => {
    exigirSesion.mockRejectedValue(new Error('sin sesión'));
    await expect(acciones.pedirCopiaDeNota({ ...entrada, notaId: 'x' })).rejects.toThrow('sin sesión');
  });
});

describe('registrarFicheroDeCopia', () => {
  const entrada = { pacienteId: P, exportacionId: E, huellaHex: HUELLA };

  it('con una entrada válida delega con la sesión, el id y la huella', async () => {
    servidor.registrarFichero.mockResolvedValue({ ok: true });
    const r = await acciones.registrarFicheroDeCopia(entrada);
    expect(r).toEqual({ ok: true });
    expect(servidor.registrarFichero).toHaveBeenCalledWith(sesion, { exportacionId: E, huellaHex: HUELLA });
  });
  it('con una huella inválida devuelve error y no llama al servidor', async () => {
    const r = await acciones.registrarFicheroDeCopia({ ...entrada, huellaHex: 'zz' });
    expect(r).toEqual({ ok: false, motivo: 'error' });
    expect(servidor.registrarFichero).not.toHaveBeenCalled();
  });
  it('exige sesión', async () => {
    exigirSesion.mockRejectedValue(new Error('sin sesión'));
    await expect(acciones.registrarFicheroDeCopia(entrada)).rejects.toThrow('sin sesión');
  });
});
