import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// La Server Action no se puede ejecutar en jsdom —habla con Supabase y redirige—, así que
// se sustituye. Lo que estas pruebas cubren es EL CONTRATO DEL FORMULARIO: qué llega a la
// acción y qué no llega nunca porque el esquema lo paró antes.
const iniciarSesion = vi.fn();
vi.mock('./acciones', () => ({
  iniciarSesion: (...argumentos: unknown[]) => iniciarSesion(...argumentos),
}));

const { FormularioLogin } = await import('./formulario-login');

describe('FormularioLogin · la validación de cliente usa el MISMO esquema que la acción', () => {
  beforeEach(() => {
    iniciarSesion.mockReset();
    iniciarSesion.mockResolvedValue({});
  });

  it('con el formulario vacío no llama a la Server Action y enseña el error junto al campo', async () => {
    const usuario = userEvent.setup();
    render(<FormularioLogin />);

    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    // El mensaje es el del esquema Zod, no el del navegador: por eso el <form> lleva
    // noValidate. Si volviera la validación nativa, esta aserción caería.
    expect(await screen.findByText('Introduce tu contraseña')).toBeInTheDocument();
    expect(iniciarSesion).not.toHaveBeenCalled();
  });

  it('un correo mal formado se para en cliente: la acción no llega a llamarse', async () => {
    const usuario = userEvent.setup();
    render(<FormularioLogin />);

    await usuario.type(screen.getByLabelText('Correo'), 'esto-no-es-un-correo');
    await usuario.type(screen.getByLabelText('Contraseña'), 'psico1234');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Introduce un correo válido')).toBeInTheDocument();
    expect(iniciarSesion).not.toHaveBeenCalled();
  });

  it('con datos válidos llama a la acción UNA vez y con el objeto tipado, no con FormData', async () => {
    const usuario = userEvent.setup();
    render(<FormularioLogin />);

    await usuario.type(screen.getByLabelText('Correo'), 'ana@psicogestion.test');
    await usuario.type(screen.getByLabelText('Contraseña'), 'psico1234');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(iniciarSesion).toHaveBeenCalledTimes(1));
    expect(iniciarSesion).toHaveBeenCalledWith({
      correo: 'ana@psicogestion.test',
      contrasena: 'psico1234',
    });
  });

  it('un error por campo devuelto por el SERVIDOR se pinta junto a su campo, no en el aviso suelto', async () => {
    // El caso que justifica `aplicarErroresDelServidor`: la acción rechaza algo que el
    // cliente dejó pasar. Sin él, el error aparecería (si acaso) en un párrafo suelto,
    // desatado del control que lo provoca.
    iniciarSesion.mockResolvedValue({ errores: { correo: ['Ese correo no está dado de alta'] } });

    const usuario = userEvent.setup();
    render(<FormularioLogin />);

    await usuario.type(screen.getByLabelText('Correo'), 'ana@psicogestion.test');
    await usuario.type(screen.getByLabelText('Contraseña'), 'psico1234');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    const error = await screen.findByText('Ese correo no está dado de alta');
    expect(error).toBeInTheDocument();

    // Atado al campo: el lector de pantalla lo anuncia con el control, no suelto.
    const campo = screen.getByLabelText('Correo');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAttribute('aria-describedby', error.id);
  });

  it('un mensaje general del servidor se anuncia en la región viva', async () => {
    iniciarSesion.mockResolvedValue({ mensaje: 'Credenciales no válidas' });

    const usuario = userEvent.setup();
    render(<FormularioLogin />);

    await usuario.type(screen.getByLabelText('Correo'), 'ana@psicogestion.test');
    await usuario.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Credenciales no válidas')).toBeInTheDocument();
  });
});
