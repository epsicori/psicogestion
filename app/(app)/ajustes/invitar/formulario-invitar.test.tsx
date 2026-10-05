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

async function rellenarNombreYCorreo(nombre: string, correo: string) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Nombre completo'), nombre);
  await usuario.type(screen.getByLabelText('Correo electrónico'), correo);
}

describe('FormularioInvitar', () => {
  beforeEach(() => {
    invitar.mockReset();
    invitar.mockResolvedValue({});
  });

  it('el técnico administrativo SIN centro no llega a la Server Action', async () => {
    // Es el criterio de aceptación de T-006b1, y el que la primera propuesta de esta
    // pantalla incumplía: el error del `.refine` cuelga de un campo (hoy `centrosIds`), y
    // una acción que escoge el mensaje de una lista de campos sin ese se quedaba sin
    // enseñarlo.
    const usuario = userEvent.setup();
    render(<FormularioInvitar centros={CENTROS} />);

    await rellenarNombreYCorreo('Tere Técnica', 'tere@ejemplo.es');
    await elegir('Rol', 'Técnico administrativo');
    await usuario.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(await screen.findByText('El técnico administrativo exige un centro.')).toBeInTheDocument();
    expect(invitar).not.toHaveBeenCalled();
  });

  it('GEMELA: el mismo técnico CON centro sí llega, con ese centro como único y principal', async () => {
    const usuario = userEvent.setup();
    render(<FormularioInvitar centros={CENTROS} />);

    await rellenarNombreYCorreo('Tere Técnica', 'tere@ejemplo.es');
    await elegir('Rol', 'Técnico administrativo');
    await elegir('Centro', 'Centro Sur');
    await usuario.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    await waitFor(() =>
      expect(invitar).toHaveBeenCalledWith({
        nombreCompleto: 'Tere Técnica',
        correo: 'tere@ejemplo.es',
        rol: 'tecnico_administrativo',
        centrosIds: [CENTROS[1].valor],
        centroPrincipalId: CENTROS[1].valor,
      }),
    );
  });

  it('un profesional sanitario sin casillas marcadas no manda ningún centro', async () => {
    const usuario = userEvent.setup();
    render(<FormularioInvitar centros={CENTROS} />);

    await rellenarNombreYCorreo('Pau Profesional', 'pau@ejemplo.es');
    await usuario.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    await waitFor(() =>
      expect(invitar).toHaveBeenCalledWith({
        nombreCompleto: 'Pau Profesional',
        correo: 'pau@ejemplo.es',
        rol: 'profesional_sanitario',
        centrosIds: [],
        centroPrincipalId: null,
      }),
    );
  });

  it('T-041: el profesional ve los centros como casillas en un grupo con leyenda', () => {
    render(<FormularioInvitar centros={CENTROS} />);

    const grupo = screen.getByRole('group', { name: 'Centros donde atiende' });
    expect(grupo).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Centro Norte' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Centro Sur' })).not.toBeChecked();
  });

  it('T-041: con una sola casilla, esa es la principal sin preguntar', async () => {
    const usuario = userEvent.setup();
    render(<FormularioInvitar centros={CENTROS} />);

    await rellenarNombreYCorreo('Pau Profesional', 'pau@ejemplo.es');
    await usuario.click(screen.getByRole('checkbox', { name: 'Centro Norte' }));
    expect(screen.queryByRole('combobox', { name: 'Centro principal' })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    await waitFor(() =>
      expect(invitar).toHaveBeenCalledWith(
        expect.objectContaining({
          centrosIds: [CENTROS[0].valor],
          centroPrincipalId: CENTROS[0].valor,
        }),
      ),
    );
  });

  it('T-041: profesional con dos casillas y sin principal no llega a la acción; el error cuelga del principal', async () => {
    const usuario = userEvent.setup();
    render(<FormularioInvitar centros={CENTROS} />);

    await rellenarNombreYCorreo('Pau Profesional', 'pau@ejemplo.es');
    await usuario.click(screen.getByRole('checkbox', { name: 'Centro Norte' }));
    await usuario.click(screen.getByRole('checkbox', { name: 'Centro Sur' }));
    await usuario.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    const error = await screen.findByText('Elige cuál es su centro principal');
    expect(error.id).toBe('centroPrincipalId-error');
    expect(invitar).not.toHaveBeenCalled();
  });

  it('T-041 GEMELA: con dos casillas y el principal elegido, llega con los dos y ese principal', async () => {
    const usuario = userEvent.setup();
    render(<FormularioInvitar centros={CENTROS} />);

    await rellenarNombreYCorreo('Pau Profesional', 'pau@ejemplo.es');
    await usuario.click(screen.getByRole('checkbox', { name: 'Centro Norte' }));
    await usuario.click(screen.getByRole('checkbox', { name: 'Centro Sur' }));
    await elegir('Centro principal', 'Centro Sur');
    await usuario.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    await waitFor(() =>
      expect(invitar).toHaveBeenCalledWith({
        nombreCompleto: 'Pau Profesional',
        correo: 'pau@ejemplo.es',
        rol: 'profesional_sanitario',
        centrosIds: [CENTROS[0].valor, CENTROS[1].valor],
        centroPrincipalId: CENTROS[1].valor,
      }),
    );
  });

  it('T-041: desmarcar el principal lo deja sin elegir; no se elige otro en silencio', async () => {
    const usuario = userEvent.setup();
    const tercero = { valor: 'c0000001-0000-4000-8000-000000000003', etiqueta: 'Centro Este' };
    render(<FormularioInvitar centros={[...CENTROS, tercero]} />);

    await rellenarNombreYCorreo('Pau Profesional', 'pau@ejemplo.es');
    await usuario.click(screen.getByRole('checkbox', { name: 'Centro Norte' }));
    await usuario.click(screen.getByRole('checkbox', { name: 'Centro Sur' }));
    await usuario.click(screen.getByRole('checkbox', { name: 'Centro Este' }));
    await elegir('Centro principal', 'Centro Sur');
    await usuario.click(screen.getByRole('checkbox', { name: 'Centro Sur' }));
    await usuario.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(await screen.findByText('Elige cuál es su centro principal')).toBeInTheDocument();
    expect(invitar).not.toHaveBeenCalled();
  });

  it('T-041: cambiar de rol vacía las casillas', async () => {
    const usuario = userEvent.setup();
    render(<FormularioInvitar centros={CENTROS} />);

    await rellenarNombreYCorreo('Pau Profesional', 'pau@ejemplo.es');
    await usuario.click(screen.getByRole('checkbox', { name: 'Centro Norte' }));
    await usuario.click(screen.getByRole('checkbox', { name: 'Centro Sur' }));
    await elegir('Rol', 'Administrador');

    expect(screen.getByRole('checkbox', { name: 'Centro Norte' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Centro Sur' })).not.toBeChecked();

    await usuario.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    await waitFor(() =>
      expect(invitar).toHaveBeenCalledWith(
        expect.objectContaining({ rol: 'administrador', centrosIds: [], centroPrincipalId: null }),
      ),
    );
  });
});
