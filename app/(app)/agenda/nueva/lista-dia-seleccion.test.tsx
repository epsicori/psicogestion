import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { BloqueAlta } from '@/lib/citas/alta';

import { ListaDia } from '../lista-dia';
import { construirCalendarioAlta } from './vista-alta';

function bloque(fecha: string, horaLocal: string, estado: BloqueAlta['estado']): BloqueAlta {
  const [h, m] = horaLocal.split(':').map(Number);
  const inicio = new Date(`${fecha}T${String(h - 2).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  return { fecha, horaLocal, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(), estado };
}

const calendario = construirCalendarioAlta({
  fechaFoco: '2026-10-06',
  zona: 'Europe/Madrid',
  hoy: '2026-10-04',
  sugerencias: {
    modo: 'habitual',
    sugerencias: [{ fecha: '2026-10-06', horaLocal: '17:00', motivo: { tipo: 'diaHabitual', diaSemana: 2, hora: '17:00' } }],
  },
  bloques: [bloque('2026-10-06', '17:00', 'libre'), bloque('2026-10-06', '18:00', 'ocupado'), bloque('2026-10-07', '10:00', 'libre')],
});

function montar(diaInicial = 1, elegido: string | null = null) {
  const alElegir = vi.fn();
  const resultado = render(
    <ListaDia dias={calendario.dias} diaInicial={diaInicial} seleccion={{ huecos: calendario.huecos, elegido, alElegir }} />,
  );
  return { alElegir, ...resultado };
}

describe('ListaDia · modo selección', () => {
  it('un hueco libre es un botón con su etiqueta en palabras; uno ocupado no se puede enfocar', () => {
    montar();

    const libre = screen.getByRole('button', { name: /17:00, libre, sugerida, habitual/ });
    expect(libre.getAttribute('aria-pressed')).toBe('false');
    const ocupado = screen.getByText('18:00 – 18:50').parentElement as HTMLElement;
    expect(ocupado.textContent).toContain('Ocupado');
    expect(ocupado.closest('button')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /18:00/ })).toHaveLength(0);
  });

  it('elegir un hueco libre avisa con su clave', () => {
    const { alElegir } = montar();

    fireEvent.click(screen.getByRole('button', { name: /17:00, libre/ }));

    expect(alElegir).toHaveBeenCalledWith('2026-10-06T17:00', expect.stringContaining('17:00'));
  });

  it('el elegido sale pulsado y dice «elegida»', () => {
    montar(1, '2026-10-06T17:00');

    const elegido = screen.getByRole('button', { name: /17:00, libre.*elegida/ });
    expect(elegido.getAttribute('aria-pressed')).toBe('true');
    expect(elegido.textContent).toContain('Elegida');
  });

  it('cambiar de día enseña sus huecos', () => {
    montar();
    expect(screen.queryByRole('button', { name: /10:00, libre/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /miércoles, 7 de octubre/i }));

    expect(screen.getByRole('button', { name: /10:00, libre/ })).toBeTruthy();
  });

  it('un día sin huecos lo dice', () => {
    montar(4);

    expect(screen.getByText('No hay huecos libres en esta semana.')).toBeTruthy();
  });
});
