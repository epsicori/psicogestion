import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONTRASENA = 'una-contrasena-larga';
const DIEZ = Array.from({ length: 10 }, (_, i) => `NUEVO${String(i + 1).padStart(6, '0')}`);

const regenerarCodigos = vi.fn();
vi.mock('./acciones', () => ({
  regenerarCodigos: (...argumentos: unknown[]) => regenerarCodigos(...argumentos),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { FormularioRegenerar } = await import('./formulario-regenerar');

async function rellenarYEnviar(contrasena = CONTRASENA, codigo = '123456') {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Contraseña'), contrasena);
  await usuario.type(screen.getByLabelText('Código de la aplicación'), codigo);
  await usuario.click(screen.getByRole('button', { name: 'Regenerar códigos' }));
  return usuario;
}

beforeEach(() => {
  regenerarCodigos.mockReset();
  refresh.mockReset();
  document.body.innerHTML = '';
});

describe('FormularioRegenerar (T-038)', () => {
  it('solo tiene dos campos —contraseña y código— y avisa de que los códigos actuales dejan de valer', () => {
    render(<FormularioRegenerar />);

    expect(screen.getAllByLabelText(/./).filter((el) => el.tagName === 'INPUT')).toHaveLength(2);
    const contrasena = screen.getByLabelText('Contraseña');
    expect(contrasena).toHaveAttribute('type', 'password');
    expect(contrasena).toHaveAttribute('autocomplete', 'current-password');
    const codigo = screen.getByLabelText('Código de la aplicación');
    expect(codigo).toHaveAttribute('inputmode', 'numeric');
    expect(codigo).toHaveAttribute('autocomplete', 'one-time-code');
    expect(screen.getByText('Los códigos que tienes ahora dejarán de valer.')).toBeInTheDocument();
  });

  it('no llama a la acción si el esquema no pasa (código incompleto) y el error sale junto al campo', async () => {
    render(<FormularioRegenerar />);
    await rellenarYEnviar(CONTRASENA, '12');

    expect(regenerarCodigos).not.toHaveBeenCalled();
    const campo = screen.getByLabelText('Código de la aplicación');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription(/seis dígitos/);
  });

  it('manda a la acción contraseña y código, y enseña los diez códigos en una región con foco (CA10)', async () => {
    regenerarCodigos.mockResolvedValue({ codigos: DIEZ });
    render(<FormularioRegenerar />);
    await rellenarYEnviar();

    expect(regenerarCodigos).toHaveBeenCalledWith({ contrasena: CONTRASENA, codigo: '123456' });
    const region = await screen.findByRole('region', { name: 'Tus códigos de recuperación nuevos' });
    expect(document.activeElement).toBe(region);
    expect(region).toHaveAccessibleName('Tus códigos de recuperación nuevos');
    expect(region).toHaveAccessibleDescription(expect.stringContaining('solo se enseñan esta vez'));
    expect(region).toHaveAccessibleDescription(expect.stringContaining('los anteriores ya no valen'));
    for (const codigo of DIEZ) expect(screen.getByText(codigo)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('con los códigos a la vista no queda ningún temporizador (CA11)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      regenerarCodigos.mockResolvedValue({ codigos: DIEZ });
      render(<FormularioRegenerar />);
      await rellenarYEnviar();
      await screen.findByRole('region', { name: 'Tus códigos de recuperación nuevos' });

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('«Ya los he guardado» quita los códigos, refresca y lleva el foco al encabezado de los avisos', async () => {
    regenerarCodigos.mockResolvedValue({ codigos: DIEZ });
    const encabezado = document.createElement('h2');
    encabezado.id = 'avisos-seguridad-titulo';
    encabezado.tabIndex = -1;
    document.body.appendChild(encabezado);
    render(<FormularioRegenerar />, { container: document.body.appendChild(document.createElement('div')) });
    const usuario = await rellenarYEnviar();
    await screen.findByRole('region', { name: 'Tus códigos de recuperación nuevos' });

    await usuario.click(screen.getByRole('button', { name: 'Ya los he guardado' }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(DIEZ[0])).toBeNull();
    expect(document.activeElement).toBe(encabezado);
  });

  it('contraseña incorrecta: error junto al campo, foco en él y los dos campos vacíos', async () => {
    regenerarCodigos.mockResolvedValue({ errores: { contrasena: ['La contraseña no es correcta.'] } });
    render(<FormularioRegenerar />);
    await rellenarYEnviar();

    const campo = screen.getByLabelText('Contraseña');
    await waitFor(() => expect(campo).toHaveAttribute('aria-invalid', 'true'));
    expect(campo).toHaveAccessibleDescription('La contraseña no es correcta.');
    expect(document.activeElement).toBe(campo);
    expect(campo).toHaveValue('');
    expect(screen.getByLabelText('Código de la aplicación')).toHaveValue('');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('código erróneo: el foco va al campo del código y también se vacían los dos', async () => {
    regenerarCodigos.mockResolvedValue({ errores: { codigo: ['Ese código no es válido.'] } });
    render(<FormularioRegenerar />);
    await rellenarYEnviar();

    const campo = screen.getByLabelText('Código de la aplicación');
    await waitFor(() => expect(campo).toHaveAttribute('aria-invalid', 'true'));
    expect(document.activeElement).toBe(campo);
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(campo).toHaveValue('');
  });

  it.each([
    ['bloqueado', 'Demasiados intentos. Prueba de nuevo a las 12:15.'],
    ['error', 'No se han podido regenerar los códigos. Vuelve a intentarlo.'],
  ])('fallo %s: región sustitutiva con nombre, descripción y foco, y «Volver» devuelve el formulario', async (_n, mensaje) => {
    regenerarCodigos.mockResolvedValue({ mensaje });
    render(<FormularioRegenerar />);
    const usuario = await rellenarYEnviar();

    const region = await screen.findByRole('region', { name: 'No se han regenerado los códigos' });
    expect(document.activeElement).toBe(region);
    expect(region).toHaveAccessibleDescription(expect.stringContaining(mensaje));
    // La vista de fallo no lleva campos: ni la contraseña ni el código se quedan a la vista.
    expect(screen.queryByLabelText('Contraseña')).toBeNull();

    await usuario.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(screen.getByLabelText('Código de la aplicación')).toHaveValue('');
    expect(screen.queryByRole('region')).toBeNull();
    // B-H9: el foco vuelve al primer campo, no se pierde en BODY.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Contraseña')));
  });

  it('B-H2 · si la acción se rechaza, la contraseña se borra, se dice como fallo y no queda rechazo sin tratar', async () => {
    regenerarCodigos.mockRejectedValue(new Error('red caída'));
    render(<FormularioRegenerar />);
    const usuario = await rellenarYEnviar();

    const region = await screen.findByRole('region', { name: 'No se han regenerado los códigos' });
    expect(document.activeElement).toBe(region);
    expect(region).toHaveAccessibleDescription(expect.stringContaining('No se han podido regenerar los códigos'));

    await usuario.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(screen.getByLabelText('Código de la aplicación')).toHaveValue('');
  });

  it('B-H6 · la contraseña no queda en el campo tras el éxito ni al volver al formulario', async () => {
    regenerarCodigos.mockResolvedValue({ codigos: DIEZ });
    render(<FormularioRegenerar />);
    const usuario = await rellenarYEnviar();
    await screen.findByRole('region');

    await usuario.click(screen.getByRole('button', { name: 'Ya los he guardado' }));

    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(screen.getByLabelText('Código de la aplicación')).toHaveValue('');
  });
});
