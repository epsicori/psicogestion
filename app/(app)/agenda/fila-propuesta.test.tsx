import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirmarPropuestaAgenda = vi.fn();
const descartarPropuestaAgenda = vi.fn();
vi.mock('./acciones', () => ({
  confirmarPropuestaAgenda: (...a: unknown[]) => confirmarPropuestaAgenda(...a),
  descartarPropuestaAgenda: (...a: unknown[]) => descartarPropuestaAgenda(...a),
}));

const { FilaPropuesta } = await import('./fila-propuesta');

const ID = '11111111-1111-4111-8111-111111111111';

function pintar(extra: Partial<Parameters<typeof FilaPropuesta>[0]> = {}) {
  return render(
    <FilaPropuesta
      id={ID}
      nombre="Ana G."
      prevista="Prevista el 1 oct a las 10:00"
      motivo="Cae en un festivo"
      propuesta="Propuesta: 11:00–11:50"
      {...extra}
    />,
  );
}

describe('FilaPropuesta', () => {
  beforeEach(() => {
    confirmarPropuestaAgenda.mockReset();
    descartarPropuestaAgenda.mockReset();
  });

  it('Confirmar llama a la acción con el id y no toca nada más', async () => {
    confirmarPropuestaAgenda.mockResolvedValue({ ok: true, anuncio: 'Hecho.' });
    pintar();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(confirmarPropuestaAgenda).toHaveBeenCalledWith({ propuestaId: ID }));
    expect(descartarPropuestaAgenda).not.toHaveBeenCalled();
  });

  it('sin horario propuesto solo se ofrece Descartar', () => {
    pintar({ propuesta: null });
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
    expect(screen.getByText('Sin horario propuesto')).toBeInTheDocument();
  });

  it('M13 · con un rechazo permanente la fila NO desaparece: píldora, motivo, sin Confirmar, foco en Descartar', async () => {
    confirmarPropuestaAgenda.mockResolvedValue({
      ok: false,
      motivo: 'parametro_invalido',
      detalle: 'canceladaOCerrada',
      mensaje: 'La cita está cancelada o cerrada.',
    });
    pintar();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar' }));

    const descartar = await screen.findByRole('button', { name: 'Descartar' });
    expect(screen.getByText('Ya no vale')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    const parrafo = screen.getByText(/No se ha confirmado: La cita está cancelada o cerrada\./);
    expect(parrafo).toHaveTextContent('Descártala para quitarla de la lista.');
    await waitFor(() => expect(descartar).toHaveFocus());
    expect(descartar.getAttribute('aria-describedby')).toBe(parrafo.id);
    expect(screen.getByText('Ana G.')).toBeInTheDocument();
  });

  it('con hueco_ocupado Confirmar se queda, el foco no se mueve y el texto va en un status', async () => {
    confirmarPropuestaAgenda.mockResolvedValue({
      ok: false,
      motivo: 'hueco_ocupado',
      detalle: null,
      mensaje: 'Ese hueco ya está ocupado.',
    });
    pintar();
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    await userEvent.setup().click(confirmar);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ese hueco ya está ocupado.'));
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    expect(screen.queryByText('Ya no vale')).toBeNull();
    expect(screen.getByRole('button', { name: 'Descartar' })).not.toHaveFocus();
  });

  it('una propuesta que cae en un cambio de hora lo avisa', () => {
    pintar({ cambioDeHora: true });
    expect(screen.getByText('Cae en un cambio de hora: al confirmarla quedará marcada.')).toBeInTheDocument();
  });

  it('Descartar llama a su acción', async () => {
    descartarPropuestaAgenda.mockResolvedValue({ ok: true, anuncio: 'Hecho.' });
    pintar();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(descartarPropuestaAgenda).toHaveBeenCalledWith({ propuestaId: ID }));
    expect(confirmarPropuestaAgenda).not.toHaveBeenCalled();
  });
});
