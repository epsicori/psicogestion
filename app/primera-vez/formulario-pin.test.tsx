import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fijarPin = vi.fn();
vi.mock('./acciones', () => ({
  fijarPin: (...argumentos: unknown[]) => fijarPin(...argumentos),
  generarCodigos: vi.fn(),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { FormularioPin } = await import('./formulario-pin');

async function rellenar(pin: string, confirmacion: string) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('PIN de seis dígitos'), pin);
  await usuario.type(screen.getByLabelText('Repite el PIN'), confirmacion);
  await usuario.click(screen.getByRole('button', { name: 'Guardar el PIN' }));
}

describe('FormularioPin', () => {
  beforeEach(() => {
    fijarPin.mockReset();
    fijarPin.mockResolvedValue({});
    refresh.mockReset();
  });

  it('dos PIN distintos no llegan a la Server Action', async () => {
    // La confirmación es de interfaz, no del esquema: `esquemaPin` solo conoce un
    // campo. Existe porque un PIN mal tecleado NO se puede reponer (ADR-026) y
    // dejaría al usuario fuera de su propia historia.
    render(<FormularioPin />);
    await rellenar('123456', '123457');

    expect(await screen.findByText('Los dos PIN no coinciden.')).toBeInTheDocument();
    expect(fijarPin).not.toHaveBeenCalled();
  });

  it('un PIN que no son seis dígitos tampoco llega', async () => {
    render(<FormularioPin />);
    await rellenar('12ab', '12ab');

    expect(
      await screen.findByText('El PIN debe ser exactamente seis dígitos.'),
    ).toBeInTheDocument();
    expect(fijarPin).not.toHaveBeenCalled();
  });

  it('GEMELA: seis dígitos iguales sí llegan, y la confirmación NO viaja', async () => {
    render(<FormularioPin />);
    await rellenar('123456', '123456');

    await waitFor(() => expect(fijarPin).toHaveBeenCalledWith({ pin: '123456' }));
    // Ni `confirmacion` ni nada más: a la acción le va el PIN y punto.
    expect(fijarPin.mock.calls[0][0]).toEqual({ pin: '123456' });
  });

  it('al fijarlo, refresca para que el servidor vuelva a decidir el paso', async () => {
    render(<FormularioPin />);
    await rellenar('123456', '123456');

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
