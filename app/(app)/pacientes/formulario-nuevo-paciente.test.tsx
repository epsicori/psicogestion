import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const crearPaciente = vi.fn();
vi.mock('./acciones', () => ({
  crearPaciente: (...argumentos: unknown[]) => crearPaciente(...argumentos),
}));

const { FormularioNuevoPaciente } = await import('./formulario-nuevo-paciente');

const FECHA_VALIDA = '1990-05-20';

async function rellenarYEnviar(nombre: string, apellidos: string, fechaNacimiento = FECHA_VALIDA) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Nombre'), nombre);
  await usuario.type(screen.getByLabelText('Apellidos'), apellidos);
  // `userEvent.type` simula pulsaciones de teclado, y jsdom trata un `<input type="date">`
  // como tres segmentos (mes/día/año): teclear el ISO entero no lo rellena. `fireEvent.change`
  // pone el valor tal cual, que es lo que hace un navegador de verdad al soltar el selector.
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
    target: { value: fechaNacimiento },
  });
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

  it('sin fecha de nacimiento no llama a la Server Action: es obligatoria desde T-032', async () => {
    const usuario = userEvent.setup();
    render(<FormularioNuevoPaciente />);

    await usuario.type(screen.getByLabelText('Nombre'), 'Lucía');
    await usuario.type(screen.getByLabelText('Apellidos'), 'Márquez');
    await usuario.click(screen.getByRole('button', { name: 'Crear paciente' }));

    expect(crearPaciente).not.toHaveBeenCalled();
  });

  it('al acertar, el formulario se VACÍA para el siguiente', async () => {
    render(<FormularioNuevoPaciente />);
    await rellenarYEnviar('Lucía', 'Márquez');

    await waitFor(() =>
      expect(crearPaciente).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Lucía', apellidos: 'Márquez', fechaNacimiento: FECHA_VALIDA }),
      ),
    );

    await waitFor(() => expect(screen.getByLabelText('Nombre')).toHaveValue(''));
    expect(screen.getByLabelText('Apellidos')).toHaveValue('');
  });

  it('si la acción falla, el formulario CONSERVA lo escrito y enseña el motivo', async () => {
    crearPaciente.mockResolvedValue({ mensaje: 'No se pudo crear el paciente' });

    render(<FormularioNuevoPaciente />);
    await rellenarYEnviar('Lucía', 'Márquez');

    expect(await screen.findByText('No se pudo crear el paciente')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Lucía');
    expect(screen.getByLabelText('Apellidos')).toHaveValue('Márquez');
  });

  it('«Más datos» empieza cerrado: teléfono, sexo, DNI, domicilio, alergias y medicación no son visibles', () => {
    render(<FormularioNuevoPaciente />);
    expect(screen.getByText('Más datos (opcional)').closest('details')).not.toHaveAttribute('open');
  });

  it('todos los campos opcionales están dentro, aunque el <details> esté cerrado', () => {
    render(<FormularioNuevoPaciente />);
    expect(screen.getByLabelText('Teléfono')).toBeInTheDocument();
    expect(screen.getByLabelText('Sexo')).toBeInTheDocument();
    expect(screen.getByLabelText('DNI o NIE')).toBeInTheDocument();
    expect(screen.getByLabelText('Domicilio')).toBeInTheDocument();
    expect(screen.getByLabelText('Alergias')).toBeInTheDocument();
    expect(screen.getByLabelText('Medicación actual')).toBeInTheDocument();
  });

  it('un error del servidor en un campo de «Más datos» abre el <details> solo', async () => {
    crearPaciente.mockResolvedValue({ errores: { dni: ['Introduce un DNI o NIE válido'] } });

    render(<FormularioNuevoPaciente />);
    await rellenarYEnviar('Lucía', 'Márquez');

    expect(await screen.findByText('Introduce un DNI o NIE válido')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Más datos (opcional)').closest('details')).toHaveAttribute('open'),
    );
  });

  it('el 23505 de un DNI duplicado se enseña como error del campo DNI', async () => {
    crearPaciente.mockResolvedValue({ errores: { dni: ['Ese documento ya está dado de alta'] } });

    const usuario = userEvent.setup();
    render(<FormularioNuevoPaciente />);
    await usuario.type(screen.getByLabelText('DNI o NIE'), '12345678Z');
    await rellenarYEnviar('Lucía', 'Márquez');

    expect(await screen.findByText('Ese documento ya está dado de alta')).toBeInTheDocument();
  });
});
