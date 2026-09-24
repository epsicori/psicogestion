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
    expect(screen.getByLabelText('Teléfono (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Sexo (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('DNI o NIE (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Domicilio (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Alergias (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Medicación actual (opcional)')).toBeInTheDocument();
  });

  it('las etiquetas obligatorias no dicen «(opcional)»: solo lo dicen las que lo son (H7)', () => {
    render(<FormularioNuevoPaciente />);
    expect(screen.getByLabelText('Nombre')).toBeRequired();
    expect(screen.getByLabelText('Apellidos')).toBeRequired();
    expect(screen.getByLabelText('Fecha de nacimiento')).toBeRequired();
    expect(screen.queryByLabelText(/Nombre \(opcional\)/)).not.toBeInTheDocument();
  });

  it('el <summary> de «Más datos» mide al menos 44 px de alto (ADR-044, H8)', () => {
    render(<FormularioNuevoPaciente />);
    expect(screen.getByText('Más datos (opcional)')).toHaveClass('min-h-11');
  });

  it('si el usuario pliega «Más datos» con el error puesto, el siguiente envío lo vuelve a abrir (H9)', async () => {
    const usuario = userEvent.setup();
    render(<FormularioNuevoPaciente />);
    const detalles = screen.getByText('Más datos (opcional)').closest('details') as HTMLDetailsElement;

    // 1. DNI inválido: la validación de cliente lo rechaza y el panel se abre.
    await usuario.type(screen.getByLabelText('DNI o NIE (opcional)'), '1234');
    await rellenarYEnviar('Lucía', 'Márquez');
    expect(await screen.findByText('Introduce un DNI o NIE válido')).toBeInTheDocument();
    expect(detalles.open).toBe(true);

    // 2. El usuario lo pliega con el error todavía puesto.
    detalles.open = false;
    expect(detalles.open).toBe(false);

    // 3. Vuelve a enviar con el mismo DNI: el panel se reabre y el foco cae en un campo visible.
    await usuario.click(screen.getByRole('button', { name: 'Crear paciente' }));
    await waitFor(() => expect(detalles.open).toBe(true));
    expect(crearPaciente).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('DNI o NIE (opcional)')).toHaveFocus());
  });

  it('tras un alta correcta, «Más datos» se cierra para el paciente siguiente', async () => {
    const usuario = userEvent.setup();
    render(<FormularioNuevoPaciente />);
    const detalles = screen.getByText('Más datos (opcional)').closest('details') as HTMLDetailsElement;
    detalles.open = true;
    await usuario.type(screen.getByLabelText('Teléfono (opcional)'), '600123456');
    await rellenarYEnviar('Lucía', 'Márquez');

    await waitFor(() => expect(crearPaciente).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(detalles.open).toBe(false));
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
    await usuario.type(screen.getByLabelText('DNI o NIE (opcional)'), '12345678Z');
    await rellenarYEnviar('Lucía', 'Márquez');

    expect(await screen.findByText('Ese documento ya está dado de alta')).toBeInTheDocument();
  });
});
