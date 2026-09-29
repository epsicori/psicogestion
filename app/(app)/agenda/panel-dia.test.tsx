import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { citaDePrueba } from './fixtures-cita';
import { PanelDia } from './panel-dia';

const DIA = {
  fecha: '2026-09-29',
  numero: '29',
  etiquetaCorta: 'mar',
  etiquetaLarga: 'martes, 29 de septiembre de 2026',
  esHoy: true,
  delMes: true,
};

function montar(citas = [citaDePrueba()], alAbrirCita = vi.fn()) {
  const ancla = document.createElement('button');
  document.body.append(ancla);
  render(<PanelDia dia={DIA} citas={citas} ancla={ancla} alCerrar={vi.fn()} alAbrirCita={alAbrirCita} />);
  return { alAbrirCita };
}

describe('PanelDia', () => {
  it('el título es la etiqueta larga del día', () => {
    montar();
    expect(screen.getByRole('heading', { name: 'martes, 29 de septiembre de 2026' })).toBeInTheDocument();
  });

  it('lista las citas por hora, aunque lleguen desordenadas', () => {
    montar([
      citaDePrueba({ id: 'b', horaLocal: '18:00', minutoPared: 1080, nombreCorto: 'Luis P.' }),
      citaDePrueba({ id: 'a', horaLocal: '09:30', minutoPared: 570, nombreCorto: 'Ana G.' }),
    ]);
    const filas = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-cita-id'));
    expect(filas.map((f) => f.getAttribute('data-cita-id'))).toEqual(['a', 'b']);
  });

  it('cada fila lleva los mismos campos que la cita de la rejilla', () => {
    montar();
    const fila = screen.getByRole('button', { name: /Ana G\./ });
    expect(fila).toHaveTextContent('17:00');
    expect(fila).toHaveTextContent('Terapia individual · Lucía Márquez');
    expect(fila).toHaveTextContent('Programada');
  });

  it('Intro sobre una fila abre el panel de esa cita con la fila de ancla', async () => {
    const { alAbrirCita } = montar();
    const fila = screen.getByRole('button', { name: /Ana G\./ });
    fila.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(alAbrirCita).toHaveBeenCalledWith(
      expect.objectContaining({ id: '22222222-2222-4222-8222-222222222222' }),
      fila,
    );
  });

  it('un día sin citas lo dice', () => {
    montar([]);
    expect(screen.getByText('No hay citas este día.')).toBeInTheDocument();
  });
});
