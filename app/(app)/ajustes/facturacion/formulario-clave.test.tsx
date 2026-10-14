import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const acciones = vi.hoisted(() => ({
  guardarClaveProveedor: vi.fn(),
  probarConexion: vi.fn(),
  desconectarProveedor: vi.fn(),
}));
vi.mock('./acciones', () => acciones);

const { FormularioClave } = await import('./formulario-clave');

const CLAVE = 'SENTINELA_FORM_abcdefghij';

function pintar(conectado = false) {
  render(<FormularioClave proveedor="holded" programa="Programa X" conectado={conectado} />);
}

beforeEach(() => vi.clearAllMocks());

describe('FormularioClave', () => {
  it('el campo es de contraseña y empieza vacío', () => {
    pintar();
    const campo = screen.getByLabelText('Clave de acceso de Programa X');
    expect(campo).toHaveAttribute('type', 'password');
    expect(campo).toHaveValue('');
  });

  it('guarda con el mismo esquema y vacía el campo después', async () => {
    acciones.guardarClaveProveedor.mockResolvedValue({ ok: true });
    pintar();
    const campo = screen.getByLabelText('Clave de acceso de Programa X');
    await userEvent.type(campo, CLAVE);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar clave' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Clave guardada'));
    expect(acciones.guardarClaveProveedor).toHaveBeenCalledWith({ proveedor: 'holded', clave: CLAVE });
    expect(campo).toHaveValue('');
    expect(document.body.textContent).not.toContain(CLAVE);
  });

  it('una clave corta se rechaza en el cliente, junto al campo, sin llamar a la acción', async () => {
    pintar();
    await userEvent.type(screen.getByLabelText('Clave de acceso de Programa X'), 'corta');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar clave' }));

    expect(await screen.findByText('La clave no tiene un formato válido')).toBeInTheDocument();
    expect(acciones.guardarClaveProveedor).not.toHaveBeenCalled();
  });

  it('un error de la acción se enseña con su texto fijo', async () => {
    acciones.guardarClaveProveedor.mockResolvedValue({ ok: false, error: 'sin_permiso' });
    pintar();
    await userEvent.type(screen.getByLabelText('Clave de acceso de Programa X'), CLAVE);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar clave' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo el administrador gestiona el programa de facturación',
    );
  });

  it('sin programa conectado no hay botones de probar ni de desconectar', () => {
    pintar(false);
    expect(screen.queryByRole('button', { name: 'Probar conexión' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Desconectar' })).toBeNull();
  });

  it('probar conexión dice que funciona con el nombre del programa', async () => {
    acciones.probarConexion.mockResolvedValue({ ok: true });
    pintar(true);
    await userEvent.click(screen.getByRole('button', { name: 'Probar conexión' }));
    expect(await screen.findByRole('status')).toHaveTextContent('La conexión con Programa X funciona');
  });

  it('desconectar pide confirmación y solo entonces llama a la acción', async () => {
    acciones.desconectarProveedor.mockResolvedValue({ ok: true });
    pintar(true);
    await userEvent.click(screen.getByRole('button', { name: 'Desconectar' }));

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('¿Desconectar Programa X?');
    expect(acciones.desconectarProveedor).not.toHaveBeenCalled();

    const botones = dialogo.querySelectorAll('button');
    const confirmar = [...botones].find((b) => b.textContent === 'Desconectar')!;
    await userEvent.click(confirmar);

    await waitFor(() => expect(acciones.desconectarProveedor).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('Escape no cierra el diálogo de desconectar mientras la petición está en curso', async () => {
    let terminar!: (r: { ok: false; error: 'fallo' }) => void;
    acciones.desconectarProveedor.mockReturnValue(new Promise((ok) => (terminar = ok)));
    pintar(true);
    await userEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    const dialogo = await screen.findByRole('dialog');
    const confirmar = [...dialogo.querySelectorAll('button')].find((b) => b.textContent === 'Desconectar')!;
    await userEvent.click(confirmar);
    await waitFor(() => expect(acciones.desconectarProveedor).toHaveBeenCalledOnce());

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    terminar({ ok: false, error: 'fallo' });
    // El error llega con el diálogo todavía abierto: quien lo ha pedido lo ve.
    expect(await screen.findByRole('dialog')).toHaveTextContent('No se pudo completar la operación');
  });

  it('un segundo envío con Enter mientras se guarda no lanza una segunda acción', async () => {
    let terminar!: (r: { ok: true }) => void;
    acciones.guardarClaveProveedor.mockReturnValue(new Promise((ok) => (terminar = ok)));
    pintar();
    const campo = screen.getByLabelText('Clave de acceso de Programa X');
    await userEvent.type(campo, CLAVE);
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(acciones.guardarClaveProveedor).toHaveBeenCalledOnce());
    await userEvent.keyboard('{Enter}');
    expect(acciones.guardarClaveProveedor).toHaveBeenCalledOnce();
    terminar({ ok: true });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Clave guardada'));
  });
});
