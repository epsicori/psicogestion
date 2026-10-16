import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

const registrarBono = vi.fn();
vi.mock('./acciones', () => ({ registrarBono: (...a: unknown[]) => registrarBono(...a) }));

const { FormularioBono } = await import('./formulario-bono');

const PACIENTE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const PACIENTES = [{ id: PACIENTE, nombre: 'Ana', apellidos: 'Ruiz' }];
const HOY = '2026-10-14';
const ID_FIJO = '3f2b8c1e-9d4a-4b6e-8f10-2a7c5d9e1b34';

function pintar(propiedades: Partial<Parameters<typeof FormularioBono>[0]> = {}) {
  const alRegistrar = vi.fn();
  const claveDeEnvio = vi.fn<(huella: string) => string>(() => ID_FIJO);
  render(
    <FormularioBono
      pacientes={PACIENTES}
      hoy={HOY}
      claveDeEnvio={claveDeEnvio}
      alRegistrar={alRegistrar}
      {...propiedades}
    />,
  );
  return { alRegistrar, claveDeEnvio };
}

async function enviar() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${t('bonos.registrarBono')}|${t('bonos.registrando')}`) }));
  });
}

function rellenar(sesiones = '5', importe = '150,00') {
  fireEvent.change(screen.getByLabelText(t('bonos.paciente')), { target: { value: PACIENTE } });
  fireEvent.change(screen.getByLabelText(t('bonos.sesiones')), { target: { value: sesiones } });
  fireEvent.change(screen.getByLabelText(t('bonos.importe')), { target: { value: importe } });
}

beforeEach(() => registrarBono.mockReset());

describe('FormularioBono', () => {
  it('campos, ayuda del importe y caducidad que no admite el pasado', () => {
    pintar();
    expect(screen.getByLabelText(t('bonos.sesiones'))).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByLabelText(t('bonos.importe'))).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByLabelText(t('bonos.caducidad'))).toHaveAttribute('min', HOY);
    expect(screen.getByText(t('bonos.ayudaImporte'))).toBeInTheDocument();
  });

  it('no hay nada de facturar ni de cobrar en el formulario', () => {
    pintar();
    expect(screen.queryByRole('button', { name: /factur/i })).toBeNull();
    expect(screen.queryByLabelText(/forma de pago/i)).toBeNull();
  });

  it('sesiones 0 e importe 0 no llegan a la acción y se explican junto a su campo', async () => {
    pintar();
    rellenar('0', '0');
    await enviar();
    expect(registrarBono).not.toHaveBeenCalled();
    expect(await screen.findByText(t('bonos.sesionesNoValidas'))).toBeInTheDocument();
    expect(screen.getByText(t('bonos.importeCero'))).toBeInTheDocument();
  });

  it('manda la salida del esquema con la clave de envío y avisa al registrar', async () => {
    registrarBono.mockResolvedValue({ mensaje: t('bonos.bonoRegistrado') });
    const { alRegistrar, claveDeEnvio } = pintar();
    rellenar(' 5 ', ' 150,00 ');
    await enviar();
    await waitFor(() => expect(alRegistrar).toHaveBeenCalledTimes(1));
    expect(registrarBono).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID_FIJO, pacienteId: PACIENTE, sesionesTotales: '5', importe: '150,00' }),
    );
    expect(claveDeEnvio).toHaveBeenCalledTimes(1);
    expect(alRegistrar).toHaveBeenCalledWith(expect.any(String), t('bonos.bonoRegistrado'));
  });

  it('«ya registrado» también cierra', async () => {
    registrarBono.mockResolvedValue({ mensaje: t('bonos.bonoYaRegistrado') });
    const { alRegistrar } = pintar();
    rellenar();
    await enviar();
    await waitFor(() => expect(alRegistrar).toHaveBeenCalledTimes(1));
  });

  it('un error de campo del servidor va junto a su campo y no se da por registrado', async () => {
    registrarBono.mockResolvedValue({ errores: { caducidad: [t('bonos.caducidadPasada')] } });
    const { alRegistrar } = pintar();
    rellenar();
    await enviar();
    expect(await screen.findByText(t('bonos.caducidadPasada'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('bonos.caducidad'))).toHaveAttribute('aria-invalid', 'true');
    expect(alRegistrar).not.toHaveBeenCalled();
  });

  it('el mensaje genérico se anuncia y no se da por registrado', async () => {
    registrarBono.mockResolvedValue({ mensaje: t('bonos.noSePudoRegistrar') });
    const { alRegistrar } = pintar();
    rellenar();
    await enviar();
    expect(await screen.findByText(t('bonos.noSePudoRegistrar'))).toBeInTheDocument();
    expect(alRegistrar).not.toHaveBeenCalled();
  });

  it('una excepción de la acción: «no sabemos si se ha registrado», y el reintento usa la misma clave', async () => {
    registrarBono.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce({ mensaje: t('bonos.bonoRegistrado') });
    const { alRegistrar, claveDeEnvio } = pintar();
    rellenar();
    await enviar();
    expect(await screen.findByText(t('bonos.resultadoDesconocido'))).toBeInTheDocument();
    expect(alRegistrar).not.toHaveBeenCalled();
    await enviar();
    await waitFor(() => expect(alRegistrar).toHaveBeenCalledTimes(1));
    expect(claveDeEnvio).toHaveBeenCalledTimes(2);
    expect(registrarBono.mock.calls[1][0]).toEqual(registrarBono.mock.calls[0][0]);
  });

  it('el doble clic envía una sola vez', async () => {
    let resolver: (v: unknown) => void = () => {};
    registrarBono.mockReturnValue(new Promise((r) => (resolver = r)));
    pintar();
    rellenar();
    await enviar();
    await enviar();
    expect(registrarBono).toHaveBeenCalledTimes(1);
    await act(async () => resolver({ mensaje: t('bonos.bonoRegistrado') }));
  });

  describe('con paciente fijo (ficha)', () => {
    it('sin selector: el nombre como texto y el id por un campo oculto', async () => {
      registrarBono.mockResolvedValue({ mensaje: t('bonos.bonoRegistrado') });
      pintar({ pacientes: undefined, pacienteFijo: { id: PACIENTE, nombre: 'Ana Ruiz' } });
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(t('bonos.sesiones')), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText(t('bonos.importe')), { target: { value: '90' } });
      await enviar();
      await waitFor(() => expect(registrarBono).toHaveBeenCalledTimes(1));
      expect(registrarBono).toHaveBeenCalledWith(expect.objectContaining({ pacienteId: PACIENTE, sesionesTotales: '3' }));
    });
  });
});
