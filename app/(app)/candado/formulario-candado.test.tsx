import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const abrirHistoria = vi.fn();
const cerrarHistoria = vi.fn();
const prolongarApertura = vi.fn();

vi.mock('./acciones', () => ({
  abrirHistoria: (...a: unknown[]) => abrirHistoria(...a),
  cerrarHistoria: (...a: unknown[]) => cerrarHistoria(...a),
  prolongarApertura: (...a: unknown[]) => prolongarApertura(...a),
}));

const { FormularioCandado } = await import('./formulario-candado');

const enMinutos = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

async function escribirPin(pin: string) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('PIN'), pin);
  await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
}

describe('FormularioCandado', () => {
  beforeEach(() => {
    abrirHistoria.mockReset();
    cerrarHistoria.mockReset().mockResolvedValue({ cerradas: 1 });
    prolongarApertura.mockReset().mockResolvedValue({ caducaEn: enMinutos(15) });
  });

  it('un PIN incorrecto y un candado bloqueado NO se distinguen por el mensaje', async () => {
    // La base devuelve `bloqueado` tanto si ya lo estabas como si acabas de quedarte,
    // y eso es deliberado. Lo que esta prueba fija es que la pantalla tampoco añade
    // la diferencia por su cuenta: ni cuenta intentos restantes, ni dice si el PIN
    // existía.
    abrirHistoria.mockResolvedValue({
      abierta: false,
      mensaje: 'El PIN no es correcto.',
      bloqueadoHasta: null,
    });

    render(<FormularioCandado caducaEnInicial={null} />);
    await escribirPin('000000');

    const mensaje = await screen.findByText('El PIN no es correcto.');
    expect(mensaje).toBeInTheDocument();
    expect(screen.queryByText(/intento/i)).not.toBeInTheDocument();
  });

  it('bloqueado: enseña los minutos que faltan y deshabilita el campo', async () => {
    abrirHistoria.mockResolvedValue({
      abierta: false,
      mensaje: 'Demasiados intentos. Prueba de nuevo más tarde.',
      bloqueadoHasta: enMinutos(15),
    });

    render(<FormularioCandado caducaEnInicial={null} />);
    await escribirPin('000000');

    expect(await screen.findByText(/Prueba de nuevo en 15 min/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('PIN')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Abrir' })).toBeDisabled();
  });

  it('con la ventana abierta ofrece cerrar, y NO prolonga al pintarse', () => {
    // ADR-026: prolongar al renderizar dejaría el candado abierto mientras alguien
    // tuviera la pestaña olvidada. Solo se prolonga con un botón.
    render(<FormularioCandado caducaEnInicial={enMinutos(12)} />);

    expect(screen.getByRole('button', { name: 'Cerrar ahora' })).toBeInTheDocument();
    expect(prolongarApertura).not.toHaveBeenCalled();
  });

  it('el aviso de caducidad aparece solo al final, y no es un diálogo', () => {
    // Dos montajes y no un `rerender`: la caducidad entra por `useState`, que solo
    // toma el valor inicial al montar. Después la gobierna el propio componente
    // —abrir, prolongar, cerrar—, que es lo que se quiere.
    const { unmount } = render(<FormularioCandado caducaEnInicial={enMinutos(12)} />);
    expect(screen.queryByText(/Se van a cerrar en breve/)).not.toBeInTheDocument();
    unmount();

    render(<FormularioCandado caducaEnInicial={enMinutos(1)} />);
    const aviso = screen.getByText(/Se van a cerrar en breve/);
    expect(aviso).toBeInTheDocument();
    // No modal: ni diálogo, ni alerta que interrumpa al lector de pantalla.
    expect(aviso).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
