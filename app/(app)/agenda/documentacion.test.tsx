import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  cargarContexto: vi.fn(),
  leerAlertasNotaPendiente: vi.fn(),
}));

vi.mock('./datos', () => ({ cargarContexto: m.cargarContexto }));
vi.mock('@/lib/citas/agenda', () => ({ leerAlertasNotaPendiente: m.leerAlertasNotaPendiente }));

import { Documentacion } from './documentacion';

function contexto(rol: string | null) {
  return { ok: true, sesion: { usuario: { id: 'u1' } }, rol, hoy: '2026-10-01' };
}

describe('Documentacion (bandeja de la agenda)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.leerAlertasNotaPendiente.mockResolvedValue({ ok: true, alertas: [] });
  });

  // Revisión SQL H2: la bandeja no puede ser global ni para el administrador (choque 2).
  it('al administrador le pide solo las alertas propias', async () => {
    m.cargarContexto.mockResolvedValue(contexto('administrador'));
    await Documentacion({ centroParametro: null });
    expect(m.leerAlertasNotaPendiente).toHaveBeenCalledWith(expect.anything(), { soloPropias: true });
  });

  it.each(['profesional_sanitario', 'tecnico_administrativo'])(
    'gemela: a %s no se le recorta nada más de lo que ya hace la RLS',
    async (rol) => {
      m.cargarContexto.mockResolvedValue(contexto(rol));
      await Documentacion({ centroParametro: null });
      expect(m.leerAlertasNotaPendiente).toHaveBeenCalledWith(expect.anything(), { soloPropias: false });
    },
  );
});
