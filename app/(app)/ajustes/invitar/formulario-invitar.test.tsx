import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invitar = vi.fn();
vi.mock('../acciones', () => ({
  invitar: (...argumentos: unknown[]) => invitar(...argumentos),
}));

const { FormularioInvitar } = await import('./formulario-invitar');

const CENTROS = [
  { valor: 'c0000001-0000-4000-8000-000000000001', etiqueta: 'Centro Norte' },
  { valor: 'c0000001-0000-4000-8000-000000000002', etiqueta: 'Centro Sur' },
];

// El Desplegable no es un <select>: su disparador es un role=combobox etiquetado
// por el texto de arriba (components/ui/desplegable.tsx), y así lo consulta su
// propia prueba. Se busca por el nombre accesible, no por el texto del botón.
async function elegir(etiquetaDelDesplegable: string, opcion: string) {
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole('combobox', { name: etiquetaDelDesplegable }));
  await usuario.click(screen.getByRole('option', { name: opcion }));
}

describe('FormularioInvitar', () => {
  beforeEach(() => {
    invitar.mockReset();
    invitar.mockResolvedValue({});
  });

  it('el técnico administrativo SIN centro no llega a la Server Action', async () => {
    // Es el criterio de aceptación del ticket, y el que la primera propuesta de esta
    // pantalla incumplía: el error del `.refine` cuelga de `centroId`, y una acción
    // que escoge el mensaje de una lista de campos sin ese se quedaba sin enseñarlo.
    const usuario = userEvent.setup();
    render(<FormularioInvitar centros={CENTROS} />);

    await usuario.type(screen.getByLabelText('Nombre completo'), 'Tere Técnica');
    await usuario.type(screen.getByLabelText('Correo electrónico'), 'tere@ejemplo.es');
    await elegir('Rol', 'Técnico administrativo');
    await usuario.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(await screen.findByText('El técnico administrativo exige un centro.')).toBeInTheDocument();
    expect(invitar).not.toHaveBeenCalled();
  });

  it('GEMELA: el mismo técnico CON centro sí llega, y con el centro dentro', async () => {
    const usuario = userEvent.setup();
    render(<FormularioInvitar centros={CENTROS} />);

    await usuario.type(screen.getByLabelText('Nombre completo'), 'Tere Técnica');
    await usuario.type(screen.getByLabelText('Correo electrónico'), 'tere@ejemplo.es');
    await elegir('Rol', 'Técnico administrativo');
    await elegir('Centro', 'Centro Sur');
    await usuario.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    await waitFor(() =>
      expect(invitar).toHaveBeenCalledWith({
        nombreCompleto: 'Tere Técnica',
        correo: 'tere@ejemplo.es',
        rol: 'tecnico_administrativo',
        centroId: CENTROS[1].valor,
      }),
    );
  });

  it('un profesional sanitario no pide centro, y no manda ninguno', async () => {
    const usuario = userEvent.setup();
    render(<FormularioInvitar centros={CENTROS} />);

    await usuario.type(screen.getByLabelText('Nombre completo'), 'Pau Profesional');
    await usuario.type(screen.getByLabelText('Correo electrónico'), 'pau@ejemplo.es');
    await usuario.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    await waitFor(() =>
      expect(invitar).toHaveBeenCalledWith({
        nombreCompleto: 'Pau Profesional',
        correo: 'pau@ejemplo.es',
        rol: 'profesional_sanitario',
        centroId: null,
      }),
    );
  });
});
