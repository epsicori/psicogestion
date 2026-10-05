import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ buscarPacientes: vi.fn() }));
vi.mock('./acciones', () => ({ buscarPacientes: m.buscarPacientes }));

import { BuscadorPaciente, type PacienteElegido } from './buscador-paciente';

beforeEach(() => {
  vi.clearAllMocks();
  m.buscarPacientes.mockResolvedValue({ ok: true, pacientes: [{ id: 'p1', nombre: 'Ana Pérez' }] });
});

describe('BuscadorPaciente', () => {
  it('con menos de dos letras no consulta y dice cuántas hacen falta', async () => {
    render(<BuscadorPaciente paciente={null} alElegir={() => {}} />);

    fireEvent.change(screen.getByLabelText('Buscar paciente por nombre'), { target: { value: 'a' } });
    await new Promise((r) => setTimeout(r, 400));

    expect(m.buscarPacientes).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe al menos dos letras.')).toBeTruthy();
  });

  it('con dos letras consulta, lista los resultados y elegir uno lo entrega', async () => {
    const alElegir = vi.fn();
    render(<BuscadorPaciente paciente={null} alElegir={alElegir} />);

    fireEvent.change(screen.getByLabelText('Buscar paciente por nombre'), { target: { value: 'an' } });

    const resultado = await screen.findByRole('button', { name: 'Ana Pérez' });
    expect(m.buscarPacientes).toHaveBeenCalledWith({ texto: 'an' });
    fireEvent.click(resultado);
    expect(alElegir).toHaveBeenCalledWith({ id: 'p1', nombre: 'Ana Pérez' });
  });

  it('sin coincidencias lo dice, en una región de estado', async () => {
    m.buscarPacientes.mockResolvedValue({ ok: true, pacientes: [] });
    render(<BuscadorPaciente paciente={null} alElegir={() => {}} />);

    fireEvent.change(screen.getByLabelText('Buscar paciente por nombre'), { target: { value: 'zz' } });

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Ningún paciente coincide.'));
  });

  it('con un paciente ya elegido enseña su nombre y «Cambiar» lo suelta', () => {
    const alElegir = vi.fn();
    render(<BuscadorPaciente paciente={{ id: 'p1', nombre: 'Ana Pérez' }} alElegir={alElegir} />);

    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.queryByLabelText('Buscar paciente por nombre')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(alElegir).toHaveBeenCalledWith(null);
  });
});

// man-11 (ronda 3, FALLA del verificador): el botón que se pulsa desaparece al cambiar de vista; el foco no puede caer a body.
function ConEstado({ inicial = null }: { inicial?: PacienteElegido | null }) {
  const [paciente, setPaciente] = useState<PacienteElegido | null>(inicial);
  return <BuscadorPaciente paciente={paciente} alElegir={setPaciente} />;
}

describe('BuscadorPaciente · foco (man-11)', () => {
  it('al elegir un paciente el foco pasa al botón «Cambiar»', async () => {
    render(<ConEstado />);
    fireEvent.change(screen.getByLabelText('Buscar paciente por nombre'), { target: { value: 'an' } });
    const resultado = await screen.findByRole('button', { name: 'Ana Pérez' });
    resultado.focus();

    fireEvent.click(resultado);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cambiar' }));
  });

  it('al pulsar «Cambiar» el foco vuelve al campo de búsqueda', () => {
    render(<ConEstado inicial={{ id: 'p1', nombre: 'Ana Pérez' }} />);
    const cambiar = screen.getByRole('button', { name: 'Cambiar' });
    cambiar.focus();

    fireEvent.click(cambiar);

    expect(document.activeElement).toBe(screen.getByLabelText('Buscar paciente por nombre'));
  });

  it('un paciente que ya llega elegido no roba el foco al abrir', () => {
    render(<ConEstado inicial={{ id: 'p1', nombre: 'Ana Pérez' }} />);

    expect(document.activeElement).toBe(document.body);
  });
});
