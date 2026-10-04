import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { BloqueAlta } from '@/lib/citas/alta';
import type { ResultadoSugerencias } from '@/lib/agenda/sugerencias';

import { CalendarioSeleccion } from './calendario-seleccion';
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
  bloques: [
    bloque('2026-10-06', '17:00', 'libre'),
    bloque('2026-10-06', '18:00', 'ocupado'),
    bloque('2026-10-07', '10:00', 'libre'),
  ],
});

function pinta(extra: Partial<Parameters<typeof CalendarioSeleccion>[0]> = {}) {
  const props = { calendario, elegido: null, alElegir: vi.fn(), alCambiarSemana: vi.fn(), ...extra };
  return { ...render(<CalendarioSeleccion {...props} />), props };
}

describe('CalendarioSeleccion', () => {
  it('un hueco libre es un botón con su etiqueta en palabras; uno ocupado no se puede enfocar', () => {
    pinta({ diaInicial: 1 });

    const libre = screen.getByRole('button', { name: /17:00, libre, sugerida, habitual/ });
    expect(libre.getAttribute('aria-pressed')).toBe('false');
    const ocupado = screen.getByText('18:00 – 18:50').parentElement as HTMLElement;
    expect(ocupado.textContent).toContain('Ocupado');
    expect(ocupado.closest('button')).toBeNull();
    expect(ocupado.getAttribute('tabindex')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /18:00/ })).toHaveLength(0);
  });

  it('elegir un hueco libre avisa con su clave; el elegido queda pulsado y dice «elegida»', () => {
    const { props, rerender } = pinta({ diaInicial: 1 });

    fireEvent.click(screen.getByRole('button', { name: /17:00, libre/ }));
    expect(props.alElegir).toHaveBeenCalledWith('2026-10-06T17:00', expect.stringContaining('17:00'));

    rerender(<CalendarioSeleccion {...props} elegido="2026-10-06T17:00" diaInicial={1} />);
    const elegido = screen.getByRole('button', { name: /17:00, libre.*elegida/ });
    expect(elegido.getAttribute('aria-pressed')).toBe('true');
  });

  it('cambiar de día enseña sus huecos', () => {
    pinta({ diaInicial: 1 });
    expect(screen.queryByRole('button', { name: /10:00, libre/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /miércoles, 7 de octubre/i }));

    expect(screen.getByRole('button', { name: /10:00, libre/ })).toBeTruthy();
  });

  it('las semanas anterior y siguiente piden su lunes', () => {
    const { props } = pinta();

    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));

    expect(props.alCambiarSemana).toHaveBeenNthCalledWith(1, '2026-09-28');
    expect(props.alCambiarSemana).toHaveBeenNthCalledWith(2, '2026-10-12');
  });

  it('un día sin huecos lo dice', () => {
    pinta({ diaInicial: 4 });

    expect(screen.getByText('No hay huecos libres en esta semana.')).toBeTruthy();
  });
});
