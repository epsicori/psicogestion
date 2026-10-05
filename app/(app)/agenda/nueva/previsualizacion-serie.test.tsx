import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PrevisualizacionSerie } from './previsualizacion-serie';
import type { SesionVista } from './vista-alta';

const SESIONES: SesionVista[] = [
  { fecha: '2026-10-06', fechaLarga: 'Martes, 6 de octubre de 2026', hora: '17:00', estado: 'normal', alternativa: null, horaResultante: null },
  {
    fecha: '2026-10-13',
    fechaLarga: 'Martes, 13 de octubre de 2026',
    hora: null,
    estado: 'festivo',
    alternativa: 'miércoles, 14 de octubre de 2026, 17:00',
    horaResultante: null,
  },
  { fecha: '2026-10-20', fechaLarga: 'Martes, 20 de octubre de 2026', hora: '17:00', estado: 'normal', alternativa: null, horaResultante: null },
];

function pinta(extra: Partial<Parameters<typeof PrevisualizacionSerie>[0]> = {}) {
  const props = { sesiones: SESIONES, excluir: [], aceptar: [], alCambiar: vi.fn(), ...extra };
  return { ...render(<PrevisualizacionSerie {...props} />), props };
}

describe('PrevisualizacionSerie', () => {
  it('una casilla «Incluir» por sesión con hora, marcada; el bloqueo ofrece aceptar su alternativa', () => {
    pinta();

    const incluir = screen.getAllByRole('checkbox', { name: /Incluir la sesión del/ }) as HTMLInputElement[];
    expect(incluir).toHaveLength(2);
    expect(incluir.every((c) => c.checked)).toBe(true);
    const aceptar = screen.getByRole('checkbox', { name: /Aceptar la alternativa de la sesión del/ }) as HTMLInputElement;
    expect(aceptar.checked).toBe(false);
    expect(screen.getByText(/Alternativa: miércoles, 14 de octubre de 2026, 17:00/)).toBeTruthy();
  });

  it('desmarcar una sesión la excluye; aceptar una alternativa la acepta', () => {
    const { props } = pinta();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Incluir la sesión del/ })[0]);
    expect(props.alCambiar).toHaveBeenLastCalledWith({ excluir: ['2026-10-06'], aceptar: [] });

    fireEvent.click(screen.getByRole('checkbox', { name: /Aceptar la alternativa/ }));
    expect(props.alCambiar).toHaveBeenLastCalledWith({ excluir: [], aceptar: ['2026-10-13'] });
  });

  it('«Todas» queda indeterminada con alguna excluida y, al marcarla, las incluye todas', () => {
    const { props } = pinta({ excluir: ['2026-10-06'] });

    const todas = screen.getByRole('checkbox', { name: 'Incluir todas las sesiones' }) as HTMLInputElement;
    expect(todas.indeterminate).toBe(true);

    fireEvent.click(todas);
    expect(props.alCambiar).toHaveBeenLastCalledWith({ excluir: [], aceptar: [] });
  });

  it('«Todas» marcada, al pulsarla, excluye todas las sesiones con hora', () => {
    const { props } = pinta();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Incluir todas las sesiones' }));

    expect(props.alCambiar).toHaveBeenLastCalledWith({ excluir: ['2026-10-06', '2026-10-20'], aceptar: [] });
  });
});
