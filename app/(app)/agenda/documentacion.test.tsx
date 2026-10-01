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
  it('al administrador le pide solo las alertas propias y de todos los tipos (sin filtro de tipo)', async () => {
    m.cargarContexto.mockResolvedValue(contexto('administrador'));
    await Documentacion({ centroParametro: null });
    const criterio = m.leerAlertasNotaPendiente.mock.calls[0][1];
    expect(criterio.soloPropias).toBe(true);
    expect(criterio.tipos).toBeUndefined();
  });

  it('gemela: al profesional sanitario no se le recorta nada más de lo que ya hace la RLS', async () => {
    m.cargarContexto.mockResolvedValue(contexto('profesional_sanitario'));
    await Documentacion({ centroParametro: null });
    const criterio = m.leerAlertasNotaPendiente.mock.calls[0][1];
    expect(criterio.soloPropias).toBe(false);
    expect(criterio.tipos).toBeUndefined();
  });

  // Decisión del propietario (01-10-2026): lista blanca del técnico, solo el consentimiento.
  it('al técnico solo le pide consentimiento_pendiente', async () => {
    m.cargarContexto.mockResolvedValue(contexto('tecnico_administrativo'));
    await Documentacion({ centroParametro: null });
    expect(m.leerAlertasNotaPendiente).toHaveBeenCalledWith(expect.anything(), {
      soloPropias: false,
      tipos: ['consentimiento_pendiente'],
    });
  });

  // Revisión A2: sin rol conocido se cierra, no se abre; y con la misma lista blanca del técnico.
  it('con el rol sin leer pide solo las propias y solo consentimiento_pendiente', async () => {
    m.cargarContexto.mockResolvedValue(contexto(null));
    await Documentacion({ centroParametro: null });
    expect(m.leerAlertasNotaPendiente).toHaveBeenCalledWith(expect.anything(), {
      soloPropias: true,
      tipos: ['consentimiento_pendiente'],
    });
  });
});
