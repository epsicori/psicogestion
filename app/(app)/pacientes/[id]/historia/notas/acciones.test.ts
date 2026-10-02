import { beforeEach, describe, expect, it, vi } from 'vitest';

const sesion = { supabase: {}, usuario: { id: 'u1' } };
const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const cabeceras = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'prueba/1' });
vi.mock('next/headers', () => ({ headers: async () => cabeceras }));

const servidor = {
  abrirEditorDeNota: vi.fn(),
  guardarBorrador: vi.fn(),
  fijarCoprofesional: vi.fn(),
  empezarModificacion: vi.fn(),
  firmarNota: vi.fn(),
};
vi.mock('@/lib/notas/servidor', () => servidor);

const acciones = await import('./acciones');

const P = '11111111-1111-4111-8111-111111111111';
const N = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  exigirSesion.mockResolvedValue(sesion);
});

describe('abrirEditorDeNota', () => {
  it('con una entrada inválida devuelve no_disponible sin llamar al servidor', async () => {
    const r = await acciones.abrirEditorDeNota({ pacienteId: 'x', citaId: C, notaId: null, episodioId: null });
    expect(r).toEqual({ estado: 'no_disponible' });
    expect(servidor.abrirEditorDeNota).not.toHaveBeenCalled();
  });
  it('cita y nota a la vez también es inválido', async () => {
    const r = await acciones.abrirEditorDeNota({ pacienteId: P, citaId: C, notaId: N, episodioId: null });
    expect(r).toEqual({ estado: 'no_disponible' });
    expect(servidor.abrirEditorDeNota).not.toHaveBeenCalled();
  });
  it('exige sesión ANTES de validar', async () => {
    exigirSesion.mockRejectedValue(new Error('sin sesión'));
    await expect(
      acciones.abrirEditorDeNota({ pacienteId: 'x', citaId: C, notaId: null, episodioId: null }),
    ).rejects.toThrow('sin sesión');
  });
  it('pasa la sesión, la entrada y el contexto (primera IP de la cadena y agente)', async () => {
    servidor.abrirEditorDeNota.mockResolvedValue({ estado: 'bloqueada' });
    const entrada = { pacienteId: P, citaId: C, notaId: null, episodioId: null };
    const r = await acciones.abrirEditorDeNota(entrada);
    expect(r).toEqual({ estado: 'bloqueada' });
    expect(servidor.abrirEditorDeNota).toHaveBeenCalledWith(sesion, entrada, {
      ip: '203.0.113.7',
      agente: 'prueba/1',
    });
  });
});

describe.each([
  ['guardarBorrador', { pacienteId: P, notaId: N, testigo: 't', texto: 'a', reservadas: '' }],
  ['fijarCoprofesional', { pacienteId: P, notaId: N, coprofesionalId: null }],
  ['empezarModificacion', { pacienteId: P, notaId: N }],
  ['firmarNota', { pacienteId: P, notaId: N, testigo: 't', alcance: 'individual', motivo: null }],
] as const)('%s', (nombre, valida) => {
  const accion = (entrada: unknown) =>
    (acciones as unknown as Record<string, (e: unknown) => Promise<unknown>>)[nombre](entrada);
  const delServidor = () => (servidor as Record<string, ReturnType<typeof vi.fn>>)[nombre];

  it('con una entrada inválida devuelve error sin llamar al servidor', async () => {
    const r = await accion({ ...valida, notaId: 'x' });
    expect(r).toEqual({ ok: false, motivo: 'error' });
    expect(delServidor()).not.toHaveBeenCalled();
  });
  it('con una entrada válida delega en el servidor con la sesión', async () => {
    delServidor().mockResolvedValue({ ok: true, marca: nombre });
    const r = await accion(valida);
    expect(r).toEqual({ ok: true, marca: nombre });
    expect(delServidor()).toHaveBeenCalledWith(sesion, valida);
  });
  it('exige sesión', async () => {
    exigirSesion.mockRejectedValue(new Error('sin sesión'));
    await expect(accion(valida)).rejects.toThrow('sin sesión');
    expect(delServidor()).not.toHaveBeenCalled();
  });
});
