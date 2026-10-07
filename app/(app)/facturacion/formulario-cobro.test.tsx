import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

const registrarCobro = vi.fn();
vi.mock('./acciones', () => ({ registrarCobro: (...a: unknown[]) => registrarCobro(...a) }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { FormularioCobro } = await import('./formulario-cobro');

const PACIENTE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const PACIENTES = [{ id: PACIENTE, nombre: 'Ana', apellidos: 'Ruiz' }];
const HOY = '2026-10-06';

function pintar(alRegistrar = vi.fn(), alCambiarEnvio?: (enviando: boolean) => void) {
  render(
    <FormularioCobro pacientes={PACIENTES} hoy={HOY} alRegistrar={alRegistrar} alCambiarEnvio={alCambiarEnvio} />,
  );
  return alRegistrar;
}

function rellenar(importe: string) {
  fireEvent.change(screen.getByLabelText(t('cobros.paciente')), { target: { value: PACIENTE } });
  fireEvent.change(screen.getByLabelText(t('cobros.importe')), { target: { value: importe } });
  fireEvent.change(screen.getByLabelText(t('cobros.formaPago')), { target: { value: 'bizum' } });
}

async function enviar() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: t('cobros.registrarCobro') }));
  });
}

beforeEach(() => {
  registrarCobro.mockReset();
  refresh.mockReset();
});

describe('FormularioCobro', () => {
  it('la fecha empieza en hoy y no admite mañana en el selector', () => {
    pintar();
    const fecha = screen.getByLabelText(t('cobros.fecha')) as HTMLInputElement;
    expect(fecha.value).toBe(HOY);
    expect(fecha.max).toBe(HOY);
    expect(screen.getByLabelText(t('cobros.importe'))).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByText(t('cobros.ayudaImporte'))).toBeInTheDocument();
  });

  it('el motivo solo aparece si el importe es negativo', () => {
    pintar();
    expect(screen.queryByLabelText(t('cobros.motivo'))).toBeNull();
    fireEvent.change(screen.getByLabelText(t('cobros.importe')), { target: { value: '-20,00' } });
    expect(screen.getByLabelText(t('cobros.motivo'))).toBeInTheDocument();
    expect(screen.getByText(t('cobros.ayudaMotivo'))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(t('cobros.importe')), { target: { value: '20,00' } });
    expect(screen.queryByLabelText(t('cobros.motivo'))).toBeNull();
    fireEvent.change(screen.getByLabelText(t('cobros.importe')), { target: { value: 'abc' } });
    expect(screen.queryByLabelText(t('cobros.motivo'))).toBeNull();
  });

  it('una devolución sin motivo no llega a la acción', async () => {
    pintar();
    rellenar('-20,00');
    await enviar();
    expect(registrarCobro).not.toHaveBeenCalled();
    expect(await screen.findByText(t('cobros.devolucionNecesitaMotivo'))).toBeInTheDocument();
  });

  it('manda la salida del esquema y avisa cuando la acción dice «Cobro registrado»', async () => {
    registrarCobro.mockResolvedValue({ mensaje: t('cobros.cobroRegistrado') });
    const alRegistrar = pintar();
    rellenar(' 60,00 ');
    await enviar();
    await waitFor(() => expect(alRegistrar).toHaveBeenCalledTimes(1));
    expect(registrarCobro).toHaveBeenCalledWith(
      expect.objectContaining({ pacienteId: PACIENTE, importe: '60,00', fecha: HOY, formaPago: 'bizum' }),
    );
  });

  it('un error de campo del servidor va junto a su campo y no se da por registrado', async () => {
    registrarCobro.mockResolvedValue({ errores: { fecha: [t('cobros.fechaFutura')] } });
    const alRegistrar = pintar();
    rellenar('60,00');
    await enviar();
    expect(await screen.findByText(t('cobros.fechaFutura'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('cobros.fecha'))).toHaveAttribute('aria-invalid', 'true');
    expect(alRegistrar).not.toHaveBeenCalled();
  });

  it('el mensaje genérico del servidor se anuncia y no se da por registrado', async () => {
    registrarCobro.mockResolvedValue({ mensaje: t('cobros.noSePudoRegistrar') });
    const alRegistrar = pintar();
    rellenar('60,00');
    await enviar();
    expect(await screen.findByText(t('cobros.noSePudoRegistrar'))).toBeInTheDocument();
    expect(alRegistrar).not.toHaveBeenCalled();
  });

  it('B-H1: si la acción rechaza, el formulario sigue montado, avisa, no navega y conserva lo escrito', async () => {
    registrarCobro.mockRejectedValue(new Error('red'));
    const alRegistrar = pintar();
    rellenar('60,00');
    await enviar();

    expect(await screen.findByText(t('cobros.resultadoDesconocido'))).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(alRegistrar).not.toHaveBeenCalled();
    expect((screen.getByLabelText(t('cobros.importe')) as HTMLInputElement).value).toBe('60,00');
    expect(screen.getByRole('button', { name: t('cobros.registrarCobro') })).toBeInTheDocument();
  });

  describe('R3.1: clave de envío', () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    it('un segundo envío igual lleva el mismo id (UUID); con el importe cambiado, otro', async () => {
      registrarCobro.mockRejectedValue(new Error('red'));
      pintar();
      rellenar('60,00');
      await enviar();
      await screen.findByText(t('cobros.resultadoDesconocido'));
      await enviar();
      await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(2));
      const [primero, segundo] = registrarCobro.mock.calls.map((c) => c[0] as { id: string });
      expect(primero.id).toMatch(UUID);
      expect(segundo.id).toBe(primero.id);

      fireEvent.change(screen.getByLabelText(t('cobros.importe')), { target: { value: '61,00' } });
      await enviar();
      await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(3));
      expect((registrarCobro.mock.calls[2][0] as { id: string }).id).not.toBe(primero.id);
    });

    it('tras un éxito, el mismo envío lleva un id distinto', async () => {
      registrarCobro.mockResolvedValue({ mensaje: t('cobros.cobroRegistrado') });
      const alRegistrar = pintar();
      rellenar('60,00');
      await enviar();
      await waitFor(() => expect(alRegistrar).toHaveBeenCalledTimes(1));
      await enviar();
      await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(2));
      const [a, b] = registrarCobro.mock.calls.map((c) => c[0] as { id: string });
      expect(a.id).toMatch(UUID);
      expect(b.id).not.toBe(a.id);
    });
  });

  it('R3.3: un error de fecha del servidor lleva el foco a Fecha', async () => {
    registrarCobro.mockResolvedValue({ errores: { fecha: [t('cobros.fechaFutura')] } });
    pintar();
    rellenar('60,00');
    await enviar();
    await screen.findByText(t('cobros.fechaFutura'));
    await waitFor(() => expect(document.activeElement?.id).toBe('fecha'));
  });

  it('R3.3: un error de motivo del servidor lleva el foco a Motivo', async () => {
    registrarCobro.mockResolvedValue({ errores: { motivo: [t('cobros.devolucionNecesitaMotivo')] } });
    pintar();
    rellenar('-5,00');
    fireEvent.change(screen.getByLabelText(t('cobros.motivo')), { target: { value: 'Error de cobro' } });
    await enviar();
    await screen.findByText(t('cobros.devolucionNecesitaMotivo'));
    await waitFor(() => expect(document.activeElement?.id).toBe('motivo'));
  });

  it('B-H8: la región de avisos existe desde el montaje, vacía y sin empty:hidden', () => {
    const { container } = render(
      <FormularioCobro pacientes={PACIENTES} hoy={HOY} alRegistrar={vi.fn()} />,
    );
    const region = container.querySelector('p[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region).toBeEmptyDOMElement();
    expect(region?.className).not.toContain('empty:hidden');
  });

  it('B-H2: mientras envía el botón usa aria-disabled (no disabled) y un segundo envío no repite la acción', async () => {
    let resolver: (v: unknown) => void = () => {};
    registrarCobro.mockReturnValue(new Promise((r) => (resolver = r)));
    pintar();
    rellenar('60,00');
    await enviar();

    const boton = screen.getByRole('button', { name: t('cobros.registrando') });
    expect(boton).toHaveAttribute('aria-disabled', 'true');
    expect(boton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(boton);
    });
    expect(registrarCobro).toHaveBeenCalledTimes(1);

    await act(async () => resolver({ mensaje: t('cobros.noSePudoRegistrar') }));
    expect(screen.getByRole('button', { name: t('cobros.registrarCobro') })).toHaveAttribute('aria-disabled', 'false');
  });

  it('B-H2: el foco va al primer campo con error del servidor, en el orden del formulario', async () => {
    registrarCobro.mockResolvedValue({
      errores: { fecha: [t('cobros.fechaFutura')], pacienteId: [t('cobros.pacienteFusionado')] },
    });
    pintar();
    rellenar('60,00');
    await enviar();

    await screen.findByText(t('cobros.pacienteFusionado'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(t('cobros.paciente'))));
  });

  it('B-H11: avisa al diálogo de cuándo está enviando', async () => {
    let resolver: (v: unknown) => void = () => {};
    registrarCobro.mockReturnValue(new Promise((r) => (resolver = r)));
    const alCambiarEnvio = vi.fn();
    pintar(vi.fn(), alCambiarEnvio);
    rellenar('60,00');
    await enviar();
    expect(alCambiarEnvio).toHaveBeenLastCalledWith(true);

    await act(async () => resolver({ mensaje: t('cobros.noSePudoRegistrar') }));
    expect(alCambiarEnvio).toHaveBeenLastCalledWith(false);
  });

  it('no hay ningún verbo de factura (ADR-078)', () => {
    pintar();
    expect(document.body.textContent).not.toMatch(/emitir|facturar|expedir|aprobar|crear factura/i);
  });
});
