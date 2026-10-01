import { act, render, screen, waitFor } from '@testing-library/react';
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

/** La región de la zona va después de las filas, que llevan sus propios `status`. */
const regionDeZona = () => screen.getAllByRole('status').at(-1)!;

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

  // Revisión de cierre N1: la fila se desmonta en el mismo commit en que llegaría el `ok`.
  it.each([
    ['Confirmar', () => confirmarPropuestaAgenda],
    ['Descartar', () => descartarPropuestaAgenda],
  ])('%s: con el recargado en el mismo commit que el ok, se anuncia y el foco queda en la zona', async (boton, accion) => {
    const { rerender } = render(<ZonaPorConfirmar>{fila()}</ZonaPorConfirmar>);
    accion().mockImplementation(async () => {
      await Promise.resolve();
      act(() => rerender(<ZonaPorConfirmar>{null}</ZonaPorConfirmar>));
      return { ok: true, anuncio: 'Propuesta resuelta.' };
    });
    await userEvent.setup().click(screen.getByRole('button', { name: boton }));
    await waitFor(() => expect(regionDeZona()).toHaveTextContent('Propuesta resuelta.'));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.isConnected).toBe(true);
  });

  // Revisión B2-2: la zona solo toma el foco si lo tenía ella o `body`; no se lo quita a otro control.
  it('si el foco está en otro control (un selector), la resolución no se lo quita', async () => {
    let terminar: (r: { ok: true; anuncio: string }) => void = () => {};
    confirmarPropuestaAgenda.mockImplementation(() => new Promise((resolve) => (terminar = resolve as typeof terminar)));
    const { rerender } = render(
      <>
        <select aria-label="Profesional">
          <option>Todos</option>
        </select>
        <ZonaPorConfirmar>{fila()}</ZonaPorConfirmar>
      </>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar' }));
    screen.getByRole('combobox', { name: 'Profesional' }).focus();

    await act(async () => terminar({ ok: true, anuncio: 'Hecho.' }));
    rerender(
      <>
        <select aria-label="Profesional">
          <option>Todos</option>
        </select>
        <ZonaPorConfirmar>{null}</ZonaPorConfirmar>
      </>,
    );

    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Profesional' }));
    expect(regionDeZona()).toHaveTextContent('Hecho.');
  });

  // Revisión de cierre N5: dos anuncios iguales seguidos no cambian el DOM y el lector no habla.
  it('dos anuncios idénticos seguidos cambian el texto de la región', async () => {
    confirmarPropuestaAgenda.mockResolvedValue({ ok: true, anuncio: 'Propuesta confirmada.' });
    const { rerender } = render(<ZonaPorConfirmar>{fila()}</ZonaPorConfirmar>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(regionDeZona()).toHaveTextContent('Propuesta confirmada.'));
    const primero = regionDeZona().textContent;
    rerender(<ZonaPorConfirmar>{fila()}</ZonaPorConfirmar>);
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(regionDeZona().textContent).not.toBe(primero));
    expect(regionDeZona()).toHaveTextContent('Propuesta confirmada.');
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

// Revisión B-1: la zona no le quita el foco a quien ya está en un panel o un diálogo.
describe('ZonaPorConfirmar con un panel abierto', () => {
  beforeEach(() => {
    confirmarPropuestaAgenda.mockReset();
  });

  it('el resultado se anuncia pero el foco no salta a la zona', async () => {
    let resolver: (r: { ok: true; anuncio: string }) => void = () => {};
    confirmarPropuestaAgenda.mockImplementation(() => new Promise((resolve) => (resolver = resolve as typeof resolver)));
    render(
      <>
        <div role="dialog" aria-label="Otra cita">
          <button type="button">Dentro del panel</button>
        </div>
        <ZonaPorConfirmar>{fila()}</ZonaPorConfirmar>
      </>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar' }));
    const dentro = screen.getByRole('button', { name: 'Dentro del panel' });
    act(() => dentro.focus());

    await act(async () => resolver({ ok: true, anuncio: 'Hecho.' }));

    expect(regionDeZona()).toHaveTextContent('Hecho.');
    expect(document.activeElement).toBe(dentro);
  });

  it('gemela: con el panel oculto (debajo de otro) o sin panel, la zona sí recibe el foco', async () => {
    let resolver: (r: { ok: true; anuncio: string }) => void = () => {};
    confirmarPropuestaAgenda.mockImplementation(() => new Promise((resolve) => (resolver = resolve as typeof resolver)));
    render(
      <>
        <div role="dialog" aria-label="Otra cita" hidden>
          <button type="button">Dentro del panel</button>
        </div>
        <ZonaPorConfirmar>{fila()}</ZonaPorConfirmar>
      </>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar' }));
    await act(async () => resolver({ ok: true, anuncio: 'Hecho.' }));
    expect(document.activeElement).toBe(regionDeZona().parentElement);
  });
});
