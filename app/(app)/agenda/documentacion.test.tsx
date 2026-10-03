import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  cargarContexto: vi.fn(),
  leerAlertasNotaPendiente: vi.fn(),
}));

vi.mock('./datos', () => ({ cargarContexto: m.cargarContexto }));
vi.mock('@/lib/citas/agenda', () => ({ leerAlertasNotaPendiente: m.leerAlertasNotaPendiente }));
vi.mock('./acciones-alertas', () => ({ resolverAlerta: vi.fn() }));

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

// T-015 §1.7: la píldora sale del nivel que calcula la base, no de los días de calendario.
describe('Documentacion (nivel y resolver, T-015)', () => {
  function alerta(parcial: Record<string, unknown>) {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      pacienteId: '22222222-2222-4222-8222-222222222222',
      pacienteNombre: 'Ana Prueba',
      tipo: 'nota_sin_firmar',
      // Hace 30 días: con el cálculo viejo por días saldría «Más de 72 h» siempre.
      fechaReferencia: '2026-09-01',
      nivel: null,
      ...parcial,
    };
  }

  async function pintar(rol: string | null, alertas: unknown[]) {
    m.cargarContexto.mockResolvedValue(contexto(rol));
    m.leerAlertasNotaPendiente.mockResolvedValue({ ok: true, alertas });
    render((await Documentacion({ centroParametro: null }))!);
  }

  beforeEach(() => vi.clearAllMocks());

  it('nivel 1 o nulo: sin píldora aunque la fecha sea antigua', async () => {
    await pintar('profesional_sanitario', [alerta({ nivel: 1 }), alerta({ id: '33333333-3333-4333-8333-333333333333' })]);
    expect(screen.queryByText('Atrasada')).toBeNull();
    expect(screen.queryByText('Muy atrasada')).toBeNull();
  });

  it('nivel 2: «Atrasada»; nivel 3: «Muy atrasada»', async () => {
    await pintar('profesional_sanitario', [
      alerta({ nivel: 2 }),
      alerta({ id: '33333333-3333-4333-8333-333333333333', nivel: 3, fechaReferencia: '2026-10-01' }),
    ]);
    expect(screen.getByText('Atrasada')).toBeTruthy();
    expect(screen.getByText('Muy atrasada')).toBeTruthy();
  });

  it('consentimiento_pendiente con rol profesional: aparece «Marcar como resuelta»', async () => {
    await pintar('profesional_sanitario', [alerta({ tipo: 'consentimiento_pendiente' })]);
    expect(
      screen.getByRole('button', { name: 'Marcar como resuelta: Consentimiento por firmar' }),
    ).toBeTruthy();
  });

  it('gemela: nota_sin_firmar con el mismo rol no lleva el botón', async () => {
    await pintar('profesional_sanitario', [alerta({ tipo: 'nota_sin_firmar' })]);
    expect(screen.queryByRole('button', { name: /Marcar como resuelta/ })).toBeNull();
  });

  // R4: el contenedor que recibe el foco y el aviso está en las tres ramas, dentro del marco.
  it('el grupo enfocable con su status vive dentro del marco en la lista, en el vacío y en el error', async () => {
    const comprobar = () => {
      const grupo = screen.getByRole('group', { name: 'Documentación pendiente' });
      expect(grupo.getAttribute('tabindex')).toBe('-1');
      expect(grupo.closest('section')?.getAttribute('aria-labelledby')).toBe('agenda-documentacion');
      expect(grupo.querySelector('[data-estado-bloque][role="status"]')).not.toBeNull();
    };

    const { unmount } = render(
      (await (async () => {
        m.cargarContexto.mockResolvedValue(contexto('profesional_sanitario'));
        m.leerAlertasNotaPendiente.mockResolvedValue({
          ok: true,
          alertas: [alerta({ tipo: 'consentimiento_pendiente' })],
        });
        return Documentacion({ centroParametro: null });
      })())!,
    );
    comprobar();
    unmount();

    m.leerAlertasNotaPendiente.mockResolvedValue({ ok: true, alertas: [] });
    const vacio = render((await Documentacion({ centroParametro: null }))!);
    comprobar();
    vacio.unmount();

    m.leerAlertasNotaPendiente.mockResolvedValue({ ok: false, mensaje: 'No se pudo' });
    render((await Documentacion({ centroParametro: null }))!);
    comprobar();
  });

  it('técnico: no aparece en ningún tipo', async () => {
    await pintar('tecnico_administrativo', [
      alerta({ tipo: 'consentimiento_pendiente' }),
      alerta({ id: '33333333-3333-4333-8333-333333333333', tipo: 'informe_pendiente' }),
    ]);
    expect(screen.queryByRole('button', { name: /Marcar como resuelta/ })).toBeNull();
  });
});
