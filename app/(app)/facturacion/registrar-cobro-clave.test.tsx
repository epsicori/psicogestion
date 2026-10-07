import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

// R4.1: la clave de envío vive en `RegistrarCobro`, no en el formulario. Aquí van reales
// `RegistrarCobro`, `FormularioCobro` y `Dialogo`; solo la acción es simulada.
const registrarCobro = vi.fn();
vi.mock('./acciones', () => ({ registrarCobro: (...a: unknown[]) => registrarCobro(...a) }));

const { RegistrarCobro } = await import('./registrar-cobro');

const PACIENTE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const PACIENTES = [{ id: PACIENTE, nombre: 'Ana', apellidos: 'Ruiz' }];
const HOY = '2026-10-06';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pintar() {
  const { rerender } = render(<RegistrarCobro pacientes={PACIENTES} hoy={HOY} />);
  // El disparador se guarda antes de abrir: dentro del diálogo hay otro botón con el mismo nombre.
  return { disparador: screen.getByRole('button', { name: t('cobros.registrarCobro') }), rerender };
}

function abrir(disparador: HTMLElement) {
  fireEvent.click(disparador);
  return screen.getByRole('dialog', { name: t('cobros.registrarCobro') });
}

function rellenar(dialogo: HTMLElement, importe: string, referencia = '') {
  fireEvent.change(within(dialogo).getByLabelText(t('cobros.paciente')), { target: { value: PACIENTE } });
  fireEvent.change(within(dialogo).getByLabelText(t('cobros.importe')), { target: { value: importe } });
  fireEvent.change(within(dialogo).getByLabelText(t('cobros.formaPago')), { target: { value: 'bizum' } });
  fireEvent.change(within(dialogo).getByLabelText(t('cobros.referencia')), { target: { value: referencia } });
}

async function enviar(dialogo: HTMLElement) {
  await act(async () => {
    fireEvent.click(within(dialogo).getByRole('button', { name: t('cobros.registrarCobro') }));
  });
}

const idDe = (n: number) => (registrarCobro.mock.calls[n][0] as { id: string }).id;

async function cerrarConLaX(dialogo: HTMLElement) {
  await act(async () => {
    fireEvent.click(within(dialogo).getByRole('button', { name: t('interfaz.cerrar') }));
  });
  expect(screen.queryByRole('dialog')).toBeNull();
}

beforeEach(() => {
  registrarCobro.mockReset();
});

describe('RegistrarCobro · clave de envío (R4.1)', () => {
  it('cerrar y reabrir con los mismos datos: mismo id; tras un éxito, otro', async () => {
    const { disparador } = pintar();
    registrarCobro.mockRejectedValueOnce(new Error('red'));

    let dialogo = abrir(disparador);
    rellenar(dialogo, '60,00');
    await enviar(dialogo);
    expect(await screen.findByText(t('cobros.resultadoDesconocido'))).toBeInTheDocument();

    await cerrarConLaX(dialogo);

    registrarCobro.mockResolvedValueOnce({ mensaje: t('cobros.cobroRegistrado') });
    dialogo = abrir(disparador);
    rellenar(dialogo, '60');
    await enviar(dialogo);

    await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(2));
    expect(idDe(0)).toMatch(UUID);
    expect(idDe(1)).toBe(idDe(0));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent(t('cobros.cobroRegistrado'));

    registrarCobro.mockResolvedValueOnce({ mensaje: t('cobros.cobroRegistrado') });
    dialogo = abrir(disparador);
    rellenar(dialogo, '60,00');
    await enviar(dialogo);
    await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(3));
    expect(idDe(2)).not.toBe(idDe(0));
  });

  it('tras un resultadoDesconocido del servidor (A-H1), cerrar con Escape y reenviar lleva el mismo id', async () => {
    const { disparador } = pintar();
    registrarCobro.mockResolvedValue({ mensaje: t('cobros.resultadoDesconocido') });

    let dialogo = abrir(disparador);
    rellenar(dialogo, '60,00');
    await enviar(dialogo);
    expect(await screen.findByText(t('cobros.resultadoDesconocido'))).toBeInTheDocument();

    fireEvent.keyDown(dialogo, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    dialogo = abrir(disparador);
    rellenar(dialogo, '60,00');
    await enviar(dialogo);
    await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(2));
    expect(idDe(1)).toBe(idDe(0));
  });

  it('A, B, A: cada envío recupera su id', async () => {
    const { disparador } = pintar();
    registrarCobro.mockRejectedValue(new Error('red'));

    const dialogo = abrir(disparador);
    rellenar(dialogo, '60,00');
    await enviar(dialogo);
    await screen.findByText(t('cobros.resultadoDesconocido'));
    fireEvent.change(within(dialogo).getByLabelText(t('cobros.importe')), { target: { value: '61,00' } });
    await enviar(dialogo);
    await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(2));
    fireEvent.change(within(dialogo).getByLabelText(t('cobros.importe')), { target: { value: '60,00' } });
    await enviar(dialogo);
    await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(3));

    expect(idDe(1)).not.toBe(idDe(0));
    expect(idDe(2)).toBe(idDe(0));
  });

  it('gemela: tras un rechazo, cerrar y reabrir con otra Referencia lleva otro id', async () => {
    const { disparador } = pintar();
    registrarCobro.mockRejectedValue(new Error('red'));

    let dialogo = abrir(disparador);
    rellenar(dialogo, '60,00');
    await enviar(dialogo);
    await screen.findByText(t('cobros.resultadoDesconocido'));
    await cerrarConLaX(dialogo);

    dialogo = abrir(disparador);
    rellenar(dialogo, '60,00', 'TR-1');
    await enviar(dialogo);
    await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(2));
    expect(idDe(1)).not.toBe(idDe(0));
  });

  it('el aviso de resultado desconocido no nombra el botón «Registrar cobro»', () => {
    expect(t('cobros.resultadoDesconocido')).not.toContain(t('cobros.registrarCobro'));
  });

  it('el aviso de «ya estaba registrado» ni contiene «cobro registrado» ni nombra el botón', () => {
    expect(t('cobros.cobroYaRegistrado').toLowerCase()).not.toContain(t('cobros.cobroRegistrado').toLowerCase());
    expect(t('cobros.cobroYaRegistrado')).not.toContain(t('cobros.registrarCobro'));
  });

  it('«ya estaba registrado» cierra, lo anuncia y olvida la clave', async () => {
    const { disparador } = pintar();
    registrarCobro
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce({ mensaje: t('cobros.cobroYaRegistrado') })
      .mockResolvedValueOnce({ mensaje: t('cobros.cobroRegistrado') });

    let dialogo = abrir(disparador);
    rellenar(dialogo, '60,00');
    await enviar(dialogo);
    expect(await screen.findByText(t('cobros.resultadoDesconocido'))).toBeInTheDocument();
    await enviar(dialogo);

    await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(2));
    expect(idDe(1)).toBe(idDe(0));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toBe(t('cobros.cobroYaRegistrado'));

    dialogo = abrir(disparador);
    rellenar(dialogo, '60,00');
    await enviar(dialogo);
    await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(3));
    expect(idDe(2)).not.toBe(idDe(0));
  });

  it('B-H2: la lista de pacientes falla en un render posterior y vuelve; el reenvío lleva el mismo id', async () => {
    const { disparador, rerender } = pintar();
    registrarCobro.mockRejectedValue(new Error('red'));

    const dialogo = abrir(disparador);
    rellenar(dialogo, '60,00');
    await enviar(dialogo);
    await screen.findByText(t('cobros.resultadoDesconocido'));
    await cerrarConLaX(dialogo);

    rerender(<RegistrarCobro pacientes={null} hoy={HOY} />);
    expect(screen.getByText(t('cobros.errorPacientes'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('cobros.registrarCobro') })).toBeNull();

    rerender(<RegistrarCobro pacientes={PACIENTES} hoy={HOY} />);
    // Es otro nodo: el disparador se vuelve a buscar.
    const dialogo2 = abrir(screen.getByRole('button', { name: t('cobros.registrarCobro') }));
    rellenar(dialogo2, '60,00');
    await enviar(dialogo2);
    await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(2));
    expect(idDe(1)).toBe(idDe(0));
  });

  it('solo se olvida la clave del envío que sale bien: A desconocido, B con éxito, A otra vez lleva idA', async () => {
    const { disparador } = pintar();
    registrarCobro
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce({ mensaje: t('cobros.cobroRegistrado') })
      .mockRejectedValueOnce(new Error('red'));

    let dialogo = abrir(disparador);
    rellenar(dialogo, '60,00');
    await enviar(dialogo);
    await screen.findByText(t('cobros.resultadoDesconocido'));

    fireEvent.change(within(dialogo).getByLabelText(t('cobros.importe')), { target: { value: '40,00' } });
    await enviar(dialogo);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent(t('cobros.cobroRegistrado'));

    dialogo = abrir(disparador);
    rellenar(dialogo, '60,00');
    await enviar(dialogo);
    await waitFor(() => expect(registrarCobro).toHaveBeenCalledTimes(3));

    expect(idDe(1)).not.toBe(idDe(0));
    expect(idDe(2)).toBe(idDe(0));
  });
});
