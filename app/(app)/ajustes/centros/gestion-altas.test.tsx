import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const darAltaDeCentro = vi.fn();
const retirarAltaDeCentro = vi.fn();
vi.mock('../acciones', () => ({
  darAltaDeCentro: (...argumentos: unknown[]) => darAltaDeCentro(...argumentos),
  retirarAltaDeCentro: (...argumentos: unknown[]) => retirarAltaDeCentro(...argumentos),
}));

const { GestionAltas } = await import('./gestion-altas');

const NORTE = 'c0000001-0000-4000-8000-000000000001';
const SUR = 'c0000001-0000-4000-8000-000000000002';
const ESTE = 'c0000001-0000-4000-8000-000000000003';
const PAU = 'a0000001-0000-4000-8000-000000000001';
const ADA = 'a0000001-0000-4000-8000-000000000002';

const CENTROS = [
  { valor: ESTE, etiqueta: 'Centro Este' },
  { valor: NORTE, etiqueta: 'Centro Norte' },
  { valor: SUR, etiqueta: 'Centro Sur' },
];

const PERSONAS = [
  {
    perfilId: PAU,
    nombre: 'Pau Profesional',
    rol: 'Profesional sanitario',
    tienePrincipal: true,
    altas: [
      { centroId: NORTE, nombre: 'Centro Norte', principal: true, desde: '01/09/2026' },
      { centroId: SUR, nombre: 'Centro Sur', principal: false, desde: '15/09/2026' },
    ],
  },
  {
    perfilId: ADA,
    nombre: 'Ada Administradora',
    rol: 'Administrador',
    tienePrincipal: false,
    altas: [],
  },
];

async function elegir(etiquetaDelDesplegable: string, opcion: string) {
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole('combobox', { name: etiquetaDelDesplegable }));
  await usuario.click(screen.getByRole('option', { name: opcion }));
}

describe('GestionAltas', () => {
  beforeEach(() => {
    darAltaDeCentro.mockReset();
    retirarAltaDeCentro.mockReset();
  });

  it('enseña «principal» en texto y la fecha de cada alta vigente', () => {
    render(<GestionAltas personas={PERSONAS} centros={CENTROS} />);

    const norte = screen.getByText('Centro Norte', { selector: 'li *' }).closest('li')!;
    expect(within(norte).getByText('principal')).toBeInTheDocument();
    expect(within(norte).getByText('desde 01/09/2026')).toBeInTheDocument();
    const sur = screen.getByText('Centro Sur', { selector: 'li *' }).closest('li')!;
    expect(within(sur).queryByText('principal')).not.toBeInTheDocument();
    expect(screen.getByText('Sin altas de centro vigentes')).toBeInTheDocument();
  });

  it('«Retirar» en el principal abre el diálogo con el aviso del principal y el foco en Cancelar', async () => {
    const usuario = userEvent.setup();
    render(<GestionAltas personas={PERSONAS} centros={CENTROS} />);

    await usuario.click(screen.getByRole('button', { name: 'Retirar el alta de Pau Profesional en Centro Norte' }));

    const dialogo = screen.getByRole('dialog', { name: 'Retirar alta de centro' });
    expect(within(dialogo).getByText(/¿Retirar el alta de Pau Profesional en Centro Norte\?/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Es su centro principal\./)).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('GEMELA: «Retirar» en un centro que no es el principal no avisa del principal', async () => {
    const usuario = userEvent.setup();
    render(<GestionAltas personas={PERSONAS} centros={CENTROS} />);

    await usuario.click(screen.getByRole('button', { name: 'Retirar el alta de Pau Profesional en Centro Sur' }));

    const dialogo = screen.getByRole('dialog', { name: 'Retirar alta de centro' });
    expect(within(dialogo).getByText(/¿Retirar el alta de Pau Profesional en Centro Sur\?/)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/Es su centro principal\./)).not.toBeInTheDocument();
  });

  it('«Cancelar» cierra sin llamar a la acción y devuelve el foco al botón que abrió', async () => {
    const usuario = userEvent.setup();
    render(<GestionAltas personas={PERSONAS} centros={CENTROS} />);

    const boton = screen.getByRole('button', { name: 'Retirar el alta de Pau Profesional en Centro Sur' });
    await usuario.click(boton);
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
    expect(retirarAltaDeCentro).not.toHaveBeenCalled();
  });

  it('confirmar la retirada llama a la acción con { perfilId, centroId } y, con éxito, deja el foco en el estado', async () => {
    retirarAltaDeCentro.mockResolvedValue({ ok: true, mensaje: 'Alta de centro retirada.' });
    const usuario = userEvent.setup();
    render(<GestionAltas personas={PERSONAS} centros={CENTROS} />);

    await usuario.click(screen.getByRole('button', { name: 'Retirar el alta de Pau Profesional en Centro Sur' }));
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(retirarAltaDeCentro).toHaveBeenCalledWith({ perfilId: PAU, centroId: SUR });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const estado = screen.getByRole('status');
    expect(estado).toHaveTextContent('Alta de centro retirada.');
    await waitFor(() => expect(estado).toHaveFocus());
  });

  it('GEMELA: con error, el diálogo sigue abierto y el mensaje se queda dentro', async () => {
    retirarAltaDeCentro.mockResolvedValue({ mensaje: 'Ese alta ya no está vigente.' });
    const usuario = userEvent.setup();
    render(<GestionAltas personas={PERSONAS} centros={CENTROS} />);

    await usuario.click(screen.getByRole('button', { name: 'Retirar el alta de Pau Profesional en Centro Sur' }));
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));

    const dialogo = await screen.findByRole('dialog', { name: 'Retirar alta de centro' });
    expect(await within(dialogo).findByText('Ese alta ya no está vigente.')).toBeInTheDocument();
  });

  it('B-H8: si la acción lanza, el diálogo sigue abierto con el mensaje dentro y se puede reintentar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    retirarAltaDeCentro.mockRejectedValueOnce(new Error('red caída'));
    retirarAltaDeCentro.mockResolvedValueOnce({ ok: true, mensaje: 'Alta de centro retirada.' });
    const usuario = userEvent.setup();
    render(<GestionAltas personas={PERSONAS} centros={CENTROS} />);

    await usuario.click(screen.getByRole('button', { name: 'Retirar el alta de Pau Profesional en Centro Sur' }));
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));

    const dialogo = await screen.findByRole('dialog', { name: 'Retirar alta de centro' });
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('No se pudo guardar el cambio de centro.');
    // GEMELA: el botón quedó libre y el reintento funciona.
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(retirarAltaDeCentro).toHaveBeenCalledTimes(2);
  });

  it('B-H1: mientras envía, Confirmar y Cancelar son aria-disabled (no disabled) y no actúan', async () => {
    let terminar: (r: unknown) => void = () => {};
    retirarAltaDeCentro.mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    const usuario = userEvent.setup();
    render(<GestionAltas personas={PERSONAS} centros={CENTROS} />);

    await usuario.click(screen.getByRole('button', { name: 'Retirar el alta de Pau Profesional en Centro Sur' }));
    const dialogo = screen.getByRole('dialog');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));

    const confirmar = await within(dialogo).findByRole('button', { name: 'Cargando...' });
    const cancelar = within(dialogo).getByRole('button', { name: 'Cancelar' });
    for (const boton of [confirmar, cancelar]) {
      expect(boton).toHaveAttribute('aria-disabled', 'true');
      expect(boton).not.toBeDisabled();
    }
    // Ni un segundo clic en Confirmar ni Cancelar hacen nada mientras tanto.
    await usuario.click(confirmar);
    await usuario.click(cancelar);
    expect(retirarAltaDeCentro).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    terminar({ ok: true, mensaje: 'Alta de centro retirada.' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('el desplegable de centro excluye los que la persona ya tiene vigentes', async () => {
    const usuario = userEvent.setup();
    render(<GestionAltas personas={PERSONAS} centros={CENTROS} />);

    await elegir('Persona', 'Pau Profesional');
    await usuario.click(screen.getByRole('combobox', { name: 'Centro' }));

    expect(screen.getByRole('option', { name: 'Centro Este' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Centro Norte' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Centro Sur' })).not.toBeInTheDocument();
  });

  it('dar alta a quien no tiene principal avisa de que será el principal y llama con { perfilId, centroId }', async () => {
    darAltaDeCentro.mockResolvedValue({ ok: true, mensaje: 'Alta de centro dada.' });
    const usuario = userEvent.setup();
    render(<GestionAltas personas={PERSONAS} centros={CENTROS} />);

    await elegir('Persona', 'Ada Administradora');
    await elegir('Centro', 'Centro Norte');
    await usuario.click(screen.getByRole('button', { name: 'Dar alta' }));

    const dialogo = screen.getByRole('dialog', { name: 'Dar alta de centro' });
    expect(within(dialogo).getByText(/¿Dar de alta a Ada Administradora en Centro Norte\?/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Será su centro principal/)).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    expect(darAltaDeCentro).toHaveBeenCalledWith({ perfilId: ADA, centroId: NORTE });
    await waitFor(() => expect(screen.getByRole('status')).toHaveFocus());
  });

  it('GEMELA: dar alta a quien ya tiene principal no avisa del principal', async () => {
    const usuario = userEvent.setup();
    render(<GestionAltas personas={PERSONAS} centros={CENTROS} />);

    await elegir('Persona', 'Pau Profesional');
    await elegir('Centro', 'Centro Este');
    await usuario.click(screen.getByRole('button', { name: 'Dar alta' }));

    const dialogo = screen.getByRole('dialog', { name: 'Dar alta de centro' });
    expect(within(dialogo).getByText(/¿Dar de alta a Pau Profesional en Centro Este\?/)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/Será su centro principal/)).not.toBeInTheDocument();
  });
});
