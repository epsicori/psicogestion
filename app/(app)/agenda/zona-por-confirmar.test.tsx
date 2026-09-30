import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirmarPropuestaAgenda = vi.fn();
const descartarPropuestaAgenda = vi.fn();
vi.mock('./acciones', () => ({
  confirmarPropuestaAgenda: (...a: unknown[]) => confirmarPropuestaAgenda(...a),
  descartarPropuestaAgenda: (...a: unknown[]) => descartarPropuestaAgenda(...a),
}));

const { FilaPorConfirmar, ZonaPorConfirmar } = await import('./zona-por-confirmar');

const ID = '11111111-1111-4111-8111-111111111111';

function fila() {
  return (
    <FilaPorConfirmar
      id={ID}
      nombre="Ana G."
      prevista="Prevista el 1 oct a las 10:00"
      motivo="Cae en un festivo"
      propuesta="Propuesta: 11:00–11:50"
    />
  );
}

// Revisión TS H9: al resolver una propuesta de «Por confirmar» la fila se va con el recargado
// (y el bloque entero si era la última). El anuncio no puede vivir en ella, ni el foco quedarse
// en un botón que desaparece.
describe('ZonaPorConfirmar', () => {
  beforeEach(() => {
    confirmarPropuestaAgenda.mockReset();
    descartarPropuestaAgenda.mockReset();
  });

  it.each([
    ['Confirmar', () => confirmarPropuestaAgenda],
    ['Descartar', () => descartarPropuestaAgenda],
  ])('%s con éxito: el anuncio y el foco sobreviven a que la fila se vaya', async (boton, accion) => {
    accion().mockResolvedValue({ ok: true, anuncio: 'Hecho.' });
    const { rerender } = render(<ZonaPorConfirmar>{fila()}</ZonaPorConfirmar>);
    await userEvent.setup().click(screen.getByRole('button', { name: boton }));
    await waitFor(() => expect(accion()).toHaveBeenCalled());

    // El recargado: el servidor ya no trae la propuesta y el bloque devuelve null.
    rerender(<ZonaPorConfirmar>{null}</ZonaPorConfirmar>);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Hecho.'));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.isConnected).toBe(true);
  });

  it('un rechazo no mueve el foco ni anuncia en la zona: lo dice la fila', async () => {
    confirmarPropuestaAgenda.mockResolvedValue({
      ok: false,
      motivo: 'hueco_ocupado',
      detalle: null,
      mensaje: 'Ese hueco ya está ocupado.',
    });
    render(<ZonaPorConfirmar>{fila()}</ZonaPorConfirmar>);
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    await userEvent.setup().click(confirmar);
    await waitFor(() => expect(screen.getByText('Ese hueco ya está ocupado.')).toBeInTheDocument());
    expect(document.activeElement).toBe(confirmar);
  });
});
