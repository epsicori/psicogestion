import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ResultadoSugerencias } from '@/lib/agenda/sugerencias';
import type { BloqueAlta } from '@/lib/citas/alta';

import { SelectorHueco } from './selector-hueco';
import { construirCalendarioAlta } from './vista-alta';

function bloque(fecha: string, horaLocal: string, estado: BloqueAlta['estado']): BloqueAlta {
  const [h, m] = horaLocal.split(':').map(Number);
  const inicio = new Date(`${fecha}T${String(h - 2).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  return { fecha, horaLocal, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(), estado };
}

const SUGERENCIAS: ResultadoSugerencias = {
  modo: 'habitual',
  sugerencias: [{ fecha: '2026-10-06', horaLocal: '17:00', motivo: { tipo: 'diaHabitual', diaSemana: 2, hora: '17:00' } }],
};

const calendario = construirCalendarioAlta({
  fechaFoco: '2026-10-06',
  zona: 'Europe/Madrid',
  hoy: '2026-10-04',
  sugerencias: SUGERENCIAS,
  bloques: [bloque('2026-10-06', '17:00', 'libre'), bloque('2026-10-06', '18:00', 'ocupado'), bloque('2026-10-07', '10:00', 'libre')],
});

function pinta(extra: Partial<Parameters<typeof SelectorHueco>[0]> = {}) {
  const props = { calendario, elegido: null, alElegir: vi.fn(), alCambiarSemana: vi.fn(), ...extra };
  return { ...render(<SelectorHueco {...props} />), props };
}

describe('SelectorHueco', () => {
  it('dibuja la semana de la agenda (rejilla y lista) en modo selección, con la leyenda', () => {
    pinta();

    // La rejilla (md+) y la lista (móvil) están en el DOM; el CSS esconde una de las dos.
    expect(document.querySelector('[role="grid"]')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: /17:00, libre, sugerida, habitual/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('list', { name: 'Leyenda del calendario' })).toBeTruthy();
  });

  it('elegir un hueco libre avisa con su clave', () => {
    const { props } = pinta();

    fireEvent.click(screen.getAllByRole('button', { name: /17:00, libre/ })[0]);

    expect(props.alElegir).toHaveBeenCalledWith('2026-10-06T17:00', expect.stringContaining('17:00'));
  });

  it('las semanas anterior y siguiente piden su lunes', () => {
    const { props } = pinta();

    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));

    expect(props.alCambiarSemana).toHaveBeenNthCalledWith(1, '2026-09-28');
    expect(props.alCambiarSemana).toHaveBeenNthCalledWith(2, '2026-10-12');
  });

  // H12 (ronda 3): al llegar otra semana, la lista abre en el día del elegido, no en el que tenía.
  it('al cambiar de semana, la lista vuelve al día del hueco elegido', () => {
    const { rerender, props } = pinta();
    const siguiente = construirCalendarioAlta({
      fechaFoco: '2026-10-13',
      zona: 'Europe/Madrid',
      hoy: '2026-10-04',
      sugerencias: { modo: 'enFrio', sugerencias: [] },
      bloques: [bloque('2026-10-13', '10:00', 'libre'), bloque('2026-10-15', '12:00', 'libre')],
    });

    rerender(<SelectorHueco {...props} calendario={siguiente} elegido="2026-10-15T12:00" />);

    const lista = document.querySelector('[class~="md:hidden"]') as HTMLElement;
    expect(lista.querySelector('[data-dia][aria-pressed="true"]')?.getAttribute('data-dia')).toBe('2026-10-15');
    expect(lista.querySelector('button[data-hueco="2026-10-15T12:00"]')).not.toBeNull();
  });

  // H16 (ronda 3): una semana sin huecos libres tiene que decirlo también desde `md`, donde no hay lista.
  it('una semana sin ningún hueco libre lo dice; con alguno, no', () => {
    const sinLibres = construirCalendarioAlta({
      fechaFoco: '2026-10-06',
      zona: 'Europe/Madrid',
      hoy: '2026-10-04',
      sugerencias: { modo: 'enFrio', sugerencias: [] },
      bloques: [bloque('2026-10-06', '18:00', 'ocupado')],
    });
    const { unmount } = pinta({ calendario: sinLibres });
    expect(screen.getByText('No hay huecos libres en esta semana.')).toBeTruthy();
    unmount();

    pinta();
    expect(screen.queryByText('No hay huecos libres en esta semana.')).toBeNull();
  });
});

