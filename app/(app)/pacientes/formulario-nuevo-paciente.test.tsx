import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const crearPaciente = vi.fn();
vi.mock('./acciones', () => ({
  crearPaciente: (...argumentos: unknown[]) => crearPaciente(...argumentos),
}));

const { FormularioNuevoPaciente } = await import('./formulario-nuevo-paciente');

async function rellenarYEnviar(nombre: string, apellidos: string) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Nombre'), nombre);
  await usuario.type(screen.getByLabelText('Apellidos'), apellidos);
  await usuario.click(screen.getByRole('button', { name: 'Crear paciente' }));
}

describe('FormularioNuevoPaciente', () => {
  beforeEach(() => {
    crearPaciente.mockReset();
    crearPaciente.mockResolvedValue({});
  });

  it('con un campo vacío no llama a la Server Action', async () => {
    const usuario = userEvent.setup();
    render(<FormularioNuevoPaciente />);

    await usuario.type(screen.getByLabelText('Nombre'), 'Lucía');
    await usuario.click(screen.getByRole('button', { name: 'Crear paciente' }));

    expect(await screen.findByText('Introduce los apellidos')).toBeInTheDocument();
    expect(crearPaciente).not.toHaveBeenCalled();
  });

  it('al acertar, el formulario se VACÍA para el siguiente', async () => {
    // Es la única conducta que este formulario no comparte con el de acceso: allí la
    // acción redirige y la pantalla desaparece; aquí se queda, y un formulario que
    // conserva el paciente recién creado invita a darlo de alta dos veces.
    render(<FormularioNuevoPaciente />);
    await rellenarYEnviar('Lucía', 'Márquez');

    await waitFor(() =>
      expect(crearPaciente).toHaveBeenCalledWith({ nombre: 'Lucía', apellidos: 'Márquez' }),
    );

    await waitFor(() => expect(screen.getByLabelText('Nombre')).toHaveValue(''));
    expect(screen.getByLabelText('Apellidos')).toHaveValue('');
  });

  it('si la acción falla, el formulario CONSERVA lo escrito y enseña el motivo', async () => {
    // La gemela de la anterior: vaciar siempre borraría el trabajo de quien acaba de
    // toparse con un error, que es cuando menos ganas hay de volver a teclearlo.
    crearPaciente.mockResolvedValue({ mensaje: 'No se pudo crear el paciente' });

    render(<FormularioNuevoPaciente />);
    await rellenarYEnviar('Lucía', 'Márquez');

    expect(await screen.findByText('No se pudo crear el paciente')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Lucía');
    expect(screen.getByLabelText('Apellidos')).toHaveValue('Márquez');
  });
});
