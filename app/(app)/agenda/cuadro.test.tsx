import { beforeEach, describe, expect, it, vi } from 'vitest';

// Revisión TS H7: el cuadro es lista blanca (choque 6, D13). Al técnico, o sin rol, no se
// pinta NADA, ni siquiera el marco con un aviso de error cuando falla el contexto.

const m = vi.hoisted(() => ({
  cargarRol: vi.fn(),
  cargarContexto: vi.fn(),
  leerCitasRango: vi.fn(),
}));

vi.mock('./datos', () => ({ cargarRol: m.cargarRol, cargarContexto: m.cargarContexto }));
vi.mock('@/lib/citas/agenda', () => ({ leerCitasRango: m.leerCitasRango }));

const { Cuadro } = await import('./cuadro');

const CONTEXTO_ROTO = { ok: false, motivo: 'desconocido', mensaje: 'No se pudo completar la operación.' };

beforeEach(() => {
  vi.clearAllMocks();
  m.cargarContexto.mockResolvedValue(CONTEXTO_ROTO);
});

describe('Cuadro (lista blanca de roles)', () => {
  it.each(['tecnico_administrativo', null])('con rol %s y el contexto roto no pinta nada, ni el marco', async (rol) => {
    m.cargarRol.mockResolvedValue(rol);
    expect(await Cuadro({ centroParametro: null })).toBeNull();
    expect(m.leerCitasRango).not.toHaveBeenCalled();
  });

  it('gemela: al profesional con el contexto roto sí le pinta el marco con el aviso', async () => {
    m.cargarRol.mockResolvedValue('profesional_sanitario');
    expect(await Cuadro({ centroParametro: null })).not.toBeNull();
  });
});
