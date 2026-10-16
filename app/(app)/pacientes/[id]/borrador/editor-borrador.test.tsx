import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatosEditor, SesionElegible } from '@/lib/economico/borrador';

// T-046 · El editor: sesiones elegibles con su precio y régimen propuestos, línea libre, totales,
// régimen obligatorio, NIF guardado que no llega, guardado con «versión N» y descartar con diálogo.

const guardarBorradorAccion = vi.fn();
const descartarBorradorAccion = vi.fn();
vi.mock('./acciones', () => ({
  guardarBorradorAccion: (...a: unknown[]) => guardarBorradorAccion(...a),
  descartarBorradorAccion: (...a: unknown[]) => descartarBorradorAccion(...a),
}));

const { EditorBorrador } = await import('./editor-borrador');
const { AvisoDeEstado } = await import('./aviso-de-estado');
const { esquemaBorrador } = await import('./esquemas');

const PAC = '11111111-1111-4111-8111-111111111111';
const CITA = '22222222-2222-4222-8222-222222222222';
const CITA2 = '44444444-4444-4444-8444-444444444444';
const BOR = '33333333-3333-4333-8333-333333333333';

const sesion = (p: Partial<SesionElegible> = {}): SesionElegible => ({
  citaId: CITA,
  dia: '2026-10-05',
  concepto: 'Sesión del 05/10/2026',
  precioCentimos: 6000,
  regimen: 'exento_sanitario',
  ...p,
});

const borrador = (p: Partial<NonNullable<DatosEditor['borrador']>> = {}): NonNullable<DatosEditor['borrador']> => ({
  id: BOR,
  numeroVersion: 2,
  estado: 'sin_enviar',
  destinatarioNombre: 'Mutua Sur',
  tieneNif: true,
  lineas: [
    {
      concepto: 'Sesión del 05/10/2026',
      cantidad: 1,
      precio_unitario_centimos: 6000,
      regimen_iva: 'exento_sanitario',
      tipo_iva_centesimas: 0,
      cita_id: CITA,
      citaNoElegible: false,
    },
  ],
  base: 6000,
  cuota: 0,
  total: 6000,
  ...p,
});

beforeEach(() => {
  vi.clearAllMocks();
  guardarBorradorAccion.mockResolvedValue({ ok: true, borradorId: BOR, numeroVersion: 1 });
  descartarBorradorAccion.mockResolvedValue({ ok: true, borradorId: BOR, numeroVersion: 3 });
});

describe('EditorBorrador', () => {
  it('marcar una sesión añade su línea con el precio y el régimen propuestos, y los totales', async () => {
    const u = userEvent.setup();
    render(<EditorBorrador pacienteId={PAC} borrador={null} elegibles={[sesion()]} />);
    await u.click(screen.getByRole('checkbox', { name: 'Sesión del 05/10/2026' }));
    expect(screen.getByLabelText('Precio con IVA (€)')).toHaveValue('60,00');
    expect(screen.getByLabelText('IVA')).toHaveValue('exento_sanitario');
    expect(screen.getByText('Exento (sanitario)', { selector: 'option:checked' })).toBeInTheDocument();
    expect(screen.getAllByText(/60,00/).length).toBeGreaterThan(0);
  });

  it('CA10 · una sesión sin tarifa llega sin régimen y no se guarda hasta marcarlo', async () => {
    const u = userEvent.setup();
    render(<EditorBorrador pacienteId={PAC} borrador={null} elegibles={[sesion({ precioCentimos: null, regimen: null })]} />);
    await u.click(screen.getByRole('checkbox', { name: 'Sesión del 05/10/2026' }));
    expect(screen.getByLabelText('IVA')).toHaveValue('');
    expect(screen.getByLabelText('Precio con IVA (€)')).toHaveValue('');
    await u.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Marca si la línea va exenta o al 21 %')).toBeInTheDocument();
    expect(guardarBorradorAccion).not.toHaveBeenCalled();
  });

  it('CA17 · una línea libre al 21 %: el total incluye la cuota y se guarda en céntimos', async () => {
    const u = userEvent.setup();
    render(<EditorBorrador pacienteId={PAC} borrador={null} elegibles={[]} />);
    await u.click(screen.getByRole('button', { name: 'Añadir línea libre' }));
    await u.type(screen.getByLabelText('Concepto'), 'Informe');
    await u.type(screen.getByLabelText('Precio con IVA (€)'), '121,00');
    await u.selectOptions(screen.getByLabelText('IVA'), 'general');
    expect(screen.getByText('Al 21 %', { selector: 'option:checked' })).toBeInTheDocument();
    expect(screen.getByText(/121,00/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => expect(guardarBorradorAccion).toHaveBeenCalled());
    // La acción recibe los valores tal cual y los valida con el mismo esquema que el formulario.
    const enviado = guardarBorradorAccion.mock.calls[0][0];
    expect(enviado.lineas[0]).toMatchObject({ cita_id: null, precio: '121,00', regimen_iva: 'general' });
    expect(esquemaBorrador.parse(enviado).lineas[0]).toMatchObject({ precio_centimos: 12100 });
    expect(await screen.findByRole('status')).toHaveTextContent('Guardado: versión 1');
  });

  it('el aviso de no escribir nada clínico acompaña al concepto', async () => {
    const u = userEvent.setup();
    render(<EditorBorrador pacienteId={PAC} borrador={null} elegibles={[]} />);
    await u.click(screen.getByRole('button', { name: 'Añadir línea libre' }));
    expect(screen.getByLabelText('Concepto')).toHaveAccessibleDescription(
      'Lo lee quien lea el borrador: no escribas aquí nada clínico',
    );
  });

  it('CA6 · al corregir, el destinatario guardado se ofrece sin su NIF', () => {
    render(<EditorBorrador pacienteId={PAC} borrador={borrador()} elegibles={[]} />);
    const conservar = screen.getByRole('radio', { name: /Mutua Sur/ });
    expect(conservar).toBeChecked();
    expect(conservar.closest('label')).toHaveTextContent('con NIF guardado');
    expect(screen.queryByLabelText('NIF (opcional)')).not.toBeInTheDocument();
  });

  it('una línea cuya cita ya no es elegible se marca y bloquea el guardado', async () => {
    const u = userEvent.setup();
    const b = borrador({ lineas: [{ ...borrador().lineas[0], citaNoElegible: true }] });
    render(<EditorBorrador pacienteId={PAC} borrador={b} elegibles={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/ya no puede/i);
    await u.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(guardarBorradorAccion).not.toHaveBeenCalled();
  });

  it('un conflicto del servidor se dice con role=alert', async () => {
    const u = userEvent.setup();
    guardarBorradorAccion.mockResolvedValue({ ok: false, error: 'conflicto' });
    render(<EditorBorrador pacienteId={PAC} borrador={borrador()} elegibles={[sesion({ citaId: CITA2 })]} />);
    await u.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/otra versión/i);
  });

  it('descartar pide confirmación; el foco empieza en Cancelar y Escape cierra', async () => {
    const u = userEvent.setup();
    render(<EditorBorrador pacienteId={PAC} borrador={borrador()} elegibles={[]} />);
    const boton = screen.getByRole('button', { name: 'Descartar' });
    await u.click(boton);
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
    expect(descartarBorradorAccion).not.toHaveBeenCalled();
  });

  it('confirmar el descarte llama a la acción desde la versión de partida', async () => {
    const u = userEvent.setup();
    render(<EditorBorrador pacienteId={PAC} borrador={borrador()} elegibles={[]} />);
    await u.click(screen.getByRole('button', { name: 'Descartar' }));
    const dialogo = screen.getByRole('dialog');
    await u.click(within(dialogo).getByRole('button', { name: 'Descartar el borrador' }));
    await waitFor(() =>
      expect(descartarBorradorAccion).toHaveBeenCalledWith({ pacienteId: PAC, borradorId: BOR, partida: 2 }),
    );
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('al confirmar el descarte, la región de estado ya existía vacía, dice «Descartado» y recibe el foco (H3)', async () => {
    const u = userEvent.setup();
    render(<EditorBorrador pacienteId={PAC} borrador={borrador()} elegibles={[]} />);
    const estado = screen.getByRole('status');
    expect(estado).toBeEmptyDOMElement();
    await u.click(screen.getByRole('button', { name: 'Descartar' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Descartar el borrador' }));
    await waitFor(() => expect(estado).toHaveTextContent('Descartado'));
    expect(screen.getByRole('status')).toBe(estado);
    expect(estado).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('si la página revalidada sustituye el editor por la vista de solo lectura, su aviso recoge el foco (H3)', async () => {
    const u = userEvent.setup();
    const { rerender } = render(<EditorBorrador pacienteId={PAC} borrador={borrador()} elegibles={[]} />);
    await u.click(screen.getByRole('button', { name: 'Descartar' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Descartar el borrador' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveFocus());
    // Lo que hace la respuesta de la acción en la ruta de corrección: otra rama del árbol.
    rerender(<AvisoDeEstado>Descartado</AvisoDeEstado>);
    expect(screen.getByRole('status')).toHaveTextContent('Descartado');
    expect(screen.getByRole('status')).toHaveFocus();
  });

  it('el aviso de la vista de solo lectura no roba el foco si no viene de un descarte (H3)', () => {
    render(<AvisoDeEstado>Descartado</AvisoDeEstado>);
    expect(screen.getByRole('status')).not.toHaveFocus();
  });

  it('el tipo del tercero vacío se dice en su campo; de vuelta al paciente, se guarda (H4)', async () => {
    const u = userEvent.setup();
    render(<EditorBorrador pacienteId={PAC} borrador={null} elegibles={[sesion()]} />);
    await u.click(screen.getByRole('checkbox', { name: 'Sesión del 05/10/2026' }));
    await u.click(screen.getByRole('radio', { name: 'Otra persona o entidad' }));
    await u.type(screen.getByLabelText('Nombre o razón social'), 'Mutua Sur');
    await u.selectOptions(screen.getByLabelText('Tipo'), '');
    await u.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Elige si es una persona física o jurídica')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toHaveAttribute('aria-invalid', 'true');
    expect(guardarBorradorAccion).not.toHaveBeenCalled();

    await u.click(screen.getByRole('radio', { name: 'El paciente' }));
    await u.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => expect(guardarBorradorAccion).toHaveBeenCalledTimes(1));
  });
});
