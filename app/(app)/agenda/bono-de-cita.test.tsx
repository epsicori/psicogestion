import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

const leerBonoDeCita = vi.fn();
const vincularBono = vi.fn();
vi.mock('./acciones-bono', () => ({
  leerBonoDeCita: (...a: unknown[]) => leerBonoDeCita(...a),
  vincularBono: (...a: unknown[]) => vincularBono(...a),
}));

const { BonoDeCita } = await import('./bono-de-cita');

const CITA = '1b2c3d4e-5f60-4a71-8b92-2d3e4f5a6b70';
const BONO_A = '2c3d4e5f-6a71-4b82-8c93-3e4f5a6b7c80';
const BONO_B = '3d4e5f6a-7b82-4c93-8da4-4f5a6b7c8d90';

const EDITABLE = {
  visible: true,
  editable: true,
  actual: null,
  opciones: [
    { id: BONO_A, texto: 'Bono de 5 · quedan 4' },
    { id: BONO_B, texto: 'Bono de 10 · quedan 10' },
  ],
};

beforeEach(() => {
  leerBonoDeCita.mockReset();
  vincularBono.mockReset();
});

describe('BonoDeCita', () => {
  it('pide el bono de esa cita al montarse y mientras tanto avisa de que carga', async () => {
    leerBonoDeCita.mockResolvedValue({ visible: false });
    render(<BonoDeCita citaId={CITA} />);
    expect(screen.getByText(t('bonos.cita.cargando'))).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(t('bonos.cita.cargando'))).toBeNull());
    expect(leerBonoDeCita).toHaveBeenCalledWith(CITA);
  });

  it('no visible (técnico, sin bonos): no pinta rótulo ni selector', async () => {
    leerBonoDeCita.mockResolvedValue({ visible: false });
    const { container } = render(<BonoDeCita citaId={CITA} />);
    await waitFor(() => expect(screen.queryByText(t('bonos.cita.cargando'))).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it('si la lectura falla: lo dice, no se queda cargando', async () => {
    leerBonoDeCita.mockRejectedValue(new Error('red'));
    render(<BonoDeCita citaId={CITA} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('bonos.cita.errorLectura'));
  });

  it('solo lectura: el rótulo y el texto del bono, sin selector ni botón', async () => {
    leerBonoDeCita.mockResolvedValue({ visible: true, editable: false, actual: 'Bono de 5 · quedan 2' });
    render(<BonoDeCita citaId={CITA} />);
    expect(await screen.findByText('Bono de 5 · quedan 2')).toBeInTheDocument();
    expect(screen.getByText(t('bonos.cita.etiqueta'))).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('editable: selector con «Sin bono» y las opciones, y el botón sin habilitar hasta cambiar', async () => {
    leerBonoDeCita.mockResolvedValue(EDITABLE);
    render(<BonoDeCita citaId={CITA} />);
    const selector = await screen.findByRole('combobox', { name: t('bonos.cita.etiqueta') });
    expect(selector).toHaveValue('');
    expect(screen.getByRole('option', { name: t('bonos.cita.sinBono') })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bono de 5 · quedan 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('bonos.cita.guardar') })).toBeDisabled();
  });

  it('con bono vinculado, el selector arranca en él', async () => {
    leerBonoDeCita.mockResolvedValue({ ...EDITABLE, actual: BONO_B });
    render(<BonoDeCita citaId={CITA} />);
    expect(await screen.findByRole('combobox')).toHaveValue(BONO_B);
  });

  it('elegir y guardar envía la cita y el bono, y anuncia el resultado', async () => {
    const usuario = userEvent.setup();
    leerBonoDeCita.mockResolvedValue(EDITABLE);
    vincularBono.mockResolvedValue({ ok: true, mensaje: t('bonos.cita.vinculado') });
    render(<BonoDeCita citaId={CITA} />);

    await usuario.selectOptions(await screen.findByRole('combobox'), BONO_A);
    const guardar = screen.getByRole('button', { name: t('bonos.cita.guardar') });
    expect(guardar).toBeEnabled();
    await usuario.click(guardar);

    expect(vincularBono).toHaveBeenCalledWith({ citaId: CITA, bonoId: BONO_A });
    expect(await screen.findByText(t('bonos.cita.vinculado'))).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(t('bonos.cita.vinculado'));
    // Ya guardado: nada que guardar hasta el siguiente cambio.
    expect(screen.getByRole('button', { name: t('bonos.cita.guardar') })).toBeDisabled();
  });

  it('volver a «Sin bono» envía bonoId vacío', async () => {
    const usuario = userEvent.setup();
    leerBonoDeCita.mockResolvedValue({ ...EDITABLE, actual: BONO_A });
    vincularBono.mockResolvedValue({ ok: true, mensaje: t('bonos.cita.desvinculado') });
    render(<BonoDeCita citaId={CITA} />);

    await usuario.selectOptions(await screen.findByRole('combobox'), '');
    await usuario.click(screen.getByRole('button', { name: t('bonos.cita.guardar') }));

    expect(vincularBono).toHaveBeenCalledWith({ citaId: CITA, bonoId: '' });
    expect(await screen.findByText(t('bonos.cita.desvinculado'))).toBeInTheDocument();
  });

  it('si la acción falla: el mensaje, y se puede reintentar', async () => {
    const usuario = userEvent.setup();
    leerBonoDeCita.mockResolvedValue(EDITABLE);
    vincularBono.mockResolvedValue({ ok: false, mensaje: t('bonos.cita.noSePudoVincular') });
    render(<BonoDeCita citaId={CITA} />);

    await usuario.selectOptions(await screen.findByRole('combobox'), BONO_A);
    await usuario.click(screen.getByRole('button', { name: t('bonos.cita.guardar') }));

    expect(await screen.findByText(t('bonos.cita.noSePudoVincular'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('bonos.cita.guardar') })).toBeEnabled();
  });

  it('si la acción lanza: mismo mensaje, sin romper el panel', async () => {
    const usuario = userEvent.setup();
    leerBonoDeCita.mockResolvedValue(EDITABLE);
    vincularBono.mockRejectedValue(new Error('red'));
    render(<BonoDeCita citaId={CITA} />);

    await usuario.selectOptions(await screen.findByRole('combobox'), BONO_A);
    await usuario.click(screen.getByRole('button', { name: t('bonos.cita.guardar') }));

    expect(await screen.findByText(t('bonos.cita.noSePudoVincular'))).toBeInTheDocument();
  });
});
