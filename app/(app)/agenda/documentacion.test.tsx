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

const TODOS = [
  'nota_sin_firmar',
  'borrador_abandonado',
  'consentimiento_pendiente',
  'informe_pendiente',
  'evaluacion_sin_corregir',
];

describe('Documentacion (bandeja de la agenda)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.leerAlertasNotaPendiente.mockResolvedValue({ ok: true, alertas: [] });
  });

  // Revisión SQL H2: la bandeja no puede ser global ni para el administrador (choque 2).
  it('al administrador le pide solo las alertas propias', async () => {
    m.cargarContexto.mockResolvedValue(contexto('administrador'));
    await Documentacion({ centroParametro: null });
    expect(m.leerAlertasNotaPendiente).toHaveBeenCalledWith(expect.anything(), { soloPropias: true, tipos: TODOS });
  });

  it('gemela: al profesional sanitario no se le recorta nada más de lo que ya hace la RLS', async () => {
    m.cargarContexto.mockResolvedValue(contexto('profesional_sanitario'));
    await Documentacion({ centroParametro: null });
    expect(m.leerAlertasNotaPendiente).toHaveBeenCalledWith(expect.anything(), { soloPropias: false, tipos: TODOS });
  });

  // Revisión A1, decisión del propietario (01-10-2026): el técnico no recibe `nota_sin_firmar`,
  // ni la lista ni el recuento; se quita en la consulta, no al pintar.
  it('al técnico le pide todos los tipos menos nota_sin_firmar', async () => {
    m.cargarContexto.mockResolvedValue(contexto('tecnico_administrativo'));
    await Documentacion({ centroParametro: null });
    expect(m.leerAlertasNotaPendiente).toHaveBeenCalledWith(expect.anything(), {
      soloPropias: false,
      tipos: TODOS.filter((tipo) => tipo !== 'nota_sin_firmar'),
    });
  });

  // Revisión A2: sin rol conocido se cierra, no se abre.
  it('con el rol sin leer pide solo las alertas propias', async () => {
    m.cargarContexto.mockResolvedValue(contexto(null));
    await Documentacion({ centroParametro: null });
    expect(m.leerAlertasNotaPendiente).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ soloPropias: true }),
    );
  });
});
