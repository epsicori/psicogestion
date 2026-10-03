import { act, render, screen, waitFor } from '@testing-library/react';
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

  it('si generar los códigos falla al activar, el aviso se queda hasta que el usuario sigue', async () => {
    enroll.mockResolvedValue({
      data: {
        id: 'factor-nuevo',
        totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRETO' },
      },
      error: null,
    });
    generarCodigos.mockResolvedValue({ ok: false, mensaje: 'FALLO-CODIGOS' });
    render(<SegundoFactor factorVerificadoId={null} />);
    await screen.findByAltText('Código QR para configurar la verificación en dos pasos');
    await teclearYVerificar();

    expect(await screen.findByText('FALLO-CODIGOS')).toBeInTheDocument();
    expect(generarCodigos).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Tus códigos de recuperación')).toBeNull();

    // R2-H1: el foco se lleva a la vista del aviso (si no, cae en BODY y el lector de
    // pantalla no lo oye antes de que se pulse «Aceptar»).
    const activo = document.activeElement;
    expect(activo).not.toBe(document.body);
    expect(activo?.contains(screen.getByText('FALLO-CODIGOS'))).toBe(true);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Tus códigos de recuperación')).toBeNull();
  });

  it('el refresh espera al usuario: no ocurre solo por mucho que pase el tiempo (R2-H2)', async () => {
    enroll.mockResolvedValue({
      data: {
        id: 'factor-nuevo',
        totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRETO' },
      },
      error: null,
    });
    generarCodigos.mockResolvedValue({ ok: false, mensaje: 'FALLO-CODIGOS' });
    // Reloj falso desde el principio, para que un temporizador sembrado al aparecer el
    // aviso (p. ej. `setTimeout(router.refresh, 3000)`) quede bajo su control.
    // `shouldAdvanceTime` deja que el resto de la prueba (userEvent, waitFor) fluya.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<SegundoFactor factorVerificadoId={null} />);
      await screen.findByAltText('Código QR para configurar la verificación en dos pasos');
      await teclearYVerificar();
      expect(await screen.findByText('FALLO-CODIGOS')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(refresh).not.toHaveBeenCalled();
      expect(screen.getByText('FALLO-CODIGOS')).toBeInTheDocument();

      await userEvent.setup().click(screen.getByRole('button', { name: 'Aceptar' }));
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('T-038: vistas de código y de fallo accesibles, y reintento', () => {
    const FACTOR = {
      data: {
        id: 'factor-nuevo',
        totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRETO' },
      },
      error: null,
    };

    async function hastaElFallo() {
      enroll.mockResolvedValue(FACTOR);
      generarCodigos.mockResolvedValueOnce({ ok: false, mensaje: 'FALLO-CODIGOS' });
      render(<SegundoFactor factorVerificadoId={null} />);
      await screen.findByAltText('Código QR para configurar la verificación en dos pasos');
      await teclearYVerificar();
      await screen.findByText('FALLO-CODIGOS');
    }

    it('el fallo es una región con nombre y una descripción que dice dónde regenerar, con foco en ella (CA9)', async () => {
      await hastaElFallo();

      const region = screen.getByRole('region', { name: 'Verificación en dos pasos' });
      expect(document.activeElement).toBe(region);
      expect(region).toHaveAccessibleDescription(/Mi cuenta › Seguridad, con tu contraseña/);
      // El mensaje de la acción sigue visible.
      expect(region).toContainElement(screen.getByText('FALLO-CODIGOS'));
    });

    it('«Reintentar» vuelve a pedir los códigos y, si salen, los enseña en su región con foco (CA10)', async () => {
      await hastaElFallo();
      generarCodigos.mockResolvedValueOnce({ ok: true, codigos: DIEZ });

      await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));

      const region = await screen.findByRole('region', { name: 'Tus códigos de recuperación' });
      expect(generarCodigos).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(document.activeElement).toBe(region));
      expect(region).toHaveAccessibleDescription(/no se pueden volver a consultar/);
      for (const codigo of DIEZ) expect(screen.getByText(codigo)).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('si el reintento también falla, sigue en el fallo con el mensaje nuevo y sin refrescar (CA10)', async () => {
      await hastaElFallo();
      generarCodigos.mockResolvedValueOnce({ ok: false, mensaje: 'OTRO-FALLO' });

      await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));

      expect(await screen.findByText('OTRO-FALLO')).toBeInTheDocument();
      expect(generarCodigos).toHaveBeenCalledTimes(2);
      expect(refresh).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeEnabled();
    });

    it('B-H4 · en la vista de fallo, antes y después de un reintento fallido, no hay temporizadores (CA11)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await hastaElFallo();
        expect(vi.getTimerCount()).toBe(0);

        generarCodigos.mockResolvedValueOnce({ ok: false, mensaje: 'OTRO-FALLO' });
        await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
          screen.getByRole('button', { name: 'Reintentar' }),
        );
        await screen.findByText('OTRO-FALLO');

        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('B-H10 · un reintento que falla con el MISMO texto se vuelve a anunciar: el aviso se vacía mientras trabaja', async () => {
      await hastaElFallo();
      let fallar!: (valor: { ok: false; mensaje: string }) => void;
      generarCodigos.mockReturnValueOnce(new Promise((resolver) => (fallar = resolver)));

      await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));

      // Mientras está pendiente, la región de estado sigue montada y vacía: hay cambio que anunciar.
      const estado = screen.getByRole('status');
      expect(estado).toBeEmptyDOMElement();

      await act(async () => {
        fallar({ ok: false, mensaje: 'FALLO-CODIGOS' });
      });

      expect(screen.getByRole('status')).toHaveTextContent('FALLO-CODIGOS');
    });

    it('ni el fallo ni el reintento dejan temporizadores (CA11)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await hastaElFallo();
        generarCodigos.mockResolvedValueOnce({ ok: true, codigos: DIEZ });
        await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
          screen.getByRole('button', { name: 'Reintentar' }),
        );
        await screen.findByRole('region', { name: 'Tus códigos de recuperación' });

        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
