import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const canjearCodigo = vi.fn();
vi.mock('./acciones', () => ({ canjearCodigo: (...a: unknown[]) => canjearCodigo(...a) }));

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const { FormularioRecuperar } = await import('./formulario-recuperar');

async function canjear(codigo: string) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Código de recuperación'), codigo);
  await usuario.click(screen.getByRole('button', { name: 'Usar el código' }));
}

describe('FormularioRecuperar', () => {
  beforeEach(() => {
    canjearCodigo.mockReset();
    replace.mockReset();
  });

  it('al acertar lleva a enrolar de nuevo, porque el factor ya no existe', async () => {
    // Un canje correcto NO concede acceso por sí solo: `lib/cuentas/totp.ts` borra el
    // factor TOTP, así que lo único que queda es enrolar otro. Quedarse aquí con un
    // «listo» dejaría al usuario en una pantalla que ya no sirve para nada.
    canjearCodigo.mockResolvedValue({ ok: true });

    render(<FormularioRecuperar />);
    await canjear('A1CA73D520');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/primera-vez'));
  });

  it('un código inválido y uno agotado dan EL MISMO mensaje', async () => {
    // Decirle «no te quedan códigos» a quien está probando códigos ajenos es contarle
    // algo de una cuenta que no es suya. La acción ya iguala los dos motivos; esta
    // prueba fija que la pantalla no los vuelva a separar.
    canjearCodigo.mockResolvedValue({
      ok: false,
      mensaje: 'Ese código no es válido.',
      bloqueadoHasta: null,
    });

    render(<FormularioRecuperar />);
    await canjear('LOQUESEA12');

    expect(await screen.findByText('Ese código no es válido.')).toBeInTheDocument();
    expect(screen.queryByText(/quedan|agotad|sin códigos/i)).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('tras fallar, el campo se vacía: no se reintenta el mismo código sin querer', async () => {
    canjearCodigo.mockResolvedValue({
      ok: false,
      mensaje: 'Ese código no es válido.',
      bloqueadoHasta: null,
    });

    render(<FormularioRecuperar />);
    await canjear('LOQUESEA12');

    await waitFor(() => expect(screen.getByLabelText('Código de recuperación')).toHaveValue(''));
  });
});
