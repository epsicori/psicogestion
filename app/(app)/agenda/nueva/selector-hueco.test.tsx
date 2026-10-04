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
});
