import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DIEZ = Array.from({ length: 10 }, (_, i) => `AAAA${String(i + 1).padStart(6, '0')}`);

const generarCodigos = vi.fn();
vi.mock('./acciones', () => ({
  generarCodigos: (...argumentos: unknown[]) => generarCodigos(...argumentos),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const enroll = vi.fn();
const challenge = vi.fn();
const verify = vi.fn();
vi.mock('@/lib/supabase/navegador', () => ({
  crearClienteNavegador: () => ({ auth: { mfa: { enroll, challenge, verify } } }),
}));

const { SegundoFactor } = await import('./segundo-factor');

async function teclearYVerificar() {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Código de seis dígitos'), '123456');
  await usuario.click(screen.getByRole('button', { name: 'Verificar' }));
}

/** Espera a que la rama posterior al `verify` haya corrido, sea cual sea. */
async function esperarFinDeRama() {
  await waitFor(() =>
    expect(refresh.mock.calls.length + generarCodigos.mock.calls.length).toBeGreaterThan(0),
  );
}

describe('SegundoFactor (T-037)', () => {
  beforeEach(() => {
    generarCodigos.mockReset();
    // Sin valor, el código previo rompería con un TypeError y la prueba fallaría por otra cosa.
    generarCodigos.mockResolvedValue({ ok: true, codigos: DIEZ });
    refresh.mockReset();
    enroll.mockReset();
    challenge.mockReset();
    challenge.mockResolvedValue({ data: { id: 'reto-1' }, error: null });
    verify.mockReset();
    verify.mockResolvedValue({ data: {}, error: null });
  });

  it('entrar con un factor ya activo no genera códigos', async () => {
    render(<SegundoFactor factorVerificadoId="factor-1" />);
    await teclearYVerificar();
    await esperarFinDeRama();

    expect(generarCodigos).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(enroll).not.toHaveBeenCalled();
    expect(challenge).toHaveBeenCalledWith({ factorId: 'factor-1' });
    expect(screen.queryByText('Tus códigos de recuperación')).toBeNull();
  });

  it('activar el factor genera los códigos una vez y los enseña', async () => {
    enroll.mockResolvedValue({
      data: {
        id: 'factor-nuevo',
        totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRETO' },
      },
      error: null,
    });
    render(<SegundoFactor factorVerificadoId={null} />);
    await screen.findByAltText('Código QR para configurar la verificación en dos pasos');
    await teclearYVerificar();

    expect(await screen.findByText('Tus códigos de recuperación')).toBeInTheDocument();
    expect(enroll).toHaveBeenCalledTimes(1);
    expect(challenge).toHaveBeenCalledWith({ factorId: 'factor-nuevo' });
    expect(generarCodigos).toHaveBeenCalledTimes(1);
    for (const codigo of DIEZ) expect(screen.getByText(codigo)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Ya los he guardado' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('un código erróneo al entrar no genera ni refresca', async () => {
    verify.mockResolvedValue({ data: null, error: { message: 'x' } });
    render(<SegundoFactor factorVerificadoId="factor-1" />);
    await teclearYVerificar();

    expect(
      await screen.findByText(
        'Ese código no es válido. Prueba con el siguiente que te dé la aplicación.',
      ),
    ).toBeInTheDocument();
    expect(generarCodigos).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
