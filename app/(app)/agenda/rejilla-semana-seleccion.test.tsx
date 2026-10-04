import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { BloqueAlta } from '@/lib/citas/alta';

import { PX_MIN } from './arrastre';
import { construirCalendarioAlta } from './nueva/vista-alta';
import { RejillaSemana } from './rejilla-semana';

function bloque(fecha: string, horaLocal: string, estado: BloqueAlta['estado'], minutos = 50): BloqueAlta {
  const [h, m] = horaLocal.split(':').map(Number);
  const inicio = new Date(`${fecha}T${String(h - 2).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  return { fecha, horaLocal, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + minutos * 60_000).toISOString(), estado };
}

function calendarioCon(bloques: BloqueAlta[]) {
  return construirCalendarioAlta({
    fechaFoco: '2026-10-06',
    zona: 'Europe/Madrid',
    hoy: '2026-10-04',
    sugerencias: {
      modo: 'habitual',
      sugerencias: [{ fecha: '2026-10-06', horaLocal: '17:00', motivo: { tipo: 'diaHabitual', diaSemana: 2, hora: '17:00' } }],
    },
    bloques,
  });
}

function montar(bloques: BloqueAlta[], elegido: string | null = null) {
  const calendario = calendarioCon(bloques);
  const alElegir = vi.fn();
  render(
    <RejillaSemana
      titulo={calendario.titulo}
      dias={calendario.dias}
      eje={calendario.eje}
      diaInicial={1}
      seleccion={{ huecos: calendario.huecos, elegido, alElegir }}
    />,
  );
  return { calendario, alElegir };
}

describe('RejillaSemana · modo selección', () => {
  it('un hueco libre es un botón con su etiqueta en palabras, colocado a su hora con la geometría de la agenda', () => {
    const { calendario } = montar([bloque('2026-10-06', '17:00', 'libre')]);

    const libre = screen.getByRole('button', { name: /17:00, libre, sugerida, habitual/ });
    expect(libre.getAttribute('aria-pressed')).toBe('false');
    const hueco = calendario.huecos[0];
    expect(libre.style.top).toBe(`${(hueco.minutoPared - calendario.eje.desdeMinuto) * PX_MIN}px`);
    expect(libre.style.height).toBe(`${hueco.duracionMinutos * PX_MIN}px`);
  });

  it('uno ocupado no se puede enfocar y no dice qué lo ocupa', () => {
    montar([bloque('2026-10-06', '18:00', 'ocupado')]);

    expect(screen.queryAllByRole('button', { name: /18:00/ })).toHaveLength(0);
    const ocupado = screen.getByText('18:00 – 18:50').parentElement as HTMLElement;
    expect(ocupado.textContent).toContain('Ocupado');
    expect(ocupado.getAttribute('tabindex')).toBeNull();
  });

  it('elegir un hueco libre avisa con su clave; el elegido queda pulsado y dice «elegida»', () => {
    const { alElegir } = montar([bloque('2026-10-06', '17:00', 'libre')]);
    fireEvent.click(screen.getByRole('button', { name: /17:00, libre/ }));
    expect(alElegir).toHaveBeenCalledWith('2026-10-06T17:00', expect.stringContaining('17:00'));
  });

  it('el hueco elegido sale pulsado, con texto y no solo con color', () => {
    montar([bloque('2026-10-06', '17:00', 'libre')], '2026-10-06T17:00');

    const elegido = screen.getByRole('button', { name: /17:00, libre.*elegida/ });
    expect(elegido.getAttribute('aria-pressed')).toBe('true');
    expect(elegido.textContent).toContain('Elegida');
  });

  it('sugerida y habitual se dicen con texto, no solo con borde y barra', () => {
    montar([bloque('2026-10-06', '17:00', 'libre')]);

    const texto = screen.getByRole('button', { name: /17:00, libre/ }).textContent ?? '';
    expect(texto).toContain('Sugerida 1');
    expect(texto).toContain('Habitual');
  });

  it('no pinta citas ni deja soltar nada: sin arrastre, sin panel de día', () => {
    montar([bloque('2026-10-06', '17:00', 'libre')]);

    expect(document.querySelector('[data-cita-id]')).toBeNull();
  });

  it('dos huecos que se pisan no se tapan: se reparten el ancho del día', () => {
    montar([bloque('2026-10-06', '17:00', 'libre', 90), bloque('2026-10-06', '18:00', 'libre', 90)]);

    const [a, b] = Array.from(document.querySelectorAll<HTMLElement>('button[data-hueco]'));
    expect(a.style.width).toBe('50%');
    expect(b.style.width).toBe('50%');
    expect(a.style.left).not.toBe(b.style.left);
  });

  it('el botón del día lleva al primer hueco libre de ese día', () => {
    montar([bloque('2026-10-07', '10:00', 'libre')]);

    fireEvent.click(screen.getByRole('button', { name: /mié 7/i }));

    expect(document.activeElement).toBe(screen.getByRole('button', { name: /10:00, libre/ }));
  });
});
