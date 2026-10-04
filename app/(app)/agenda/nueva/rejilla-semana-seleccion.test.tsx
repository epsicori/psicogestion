import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { BloqueAlta } from '@/lib/citas/alta';

import { PX_MIN } from '../arrastre';
import { construirCalendarioAlta } from './vista-alta';
import { RejillaSemana } from '../rejilla-semana';

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

  // H10 (ronda 3): una sola parada de Tab; flechas para moverse; Tab para salir.
  describe('teclado (H10)', () => {
    const bloques = [
      bloque('2026-10-06', '10:00', 'libre'),
      bloque('2026-10-06', '12:00', 'libre'),
      bloque('2026-10-06', '16:00', 'libre'),
      bloque('2026-10-08', '10:00', 'libre'),
      bloque('2026-10-08', '12:00', 'libre'),
    ];
    const paradasDeTab = () =>
      Array.from(document.querySelectorAll<HTMLElement>('button, [tabindex]')).filter((e) => e.getAttribute('tabindex') !== '-1');

    it('con cinco huecos libres en dos días, la rejilla tiene una sola parada de Tab: el día activo', () => {
      montar(bloques);

      const paradas = paradasDeTab();
      expect(paradas).toHaveLength(1);
      expect(paradas[0].getAttribute('data-dia')).toBe('2026-10-06');
    });

    it('Flecha abajo en el día entra en sus huecos y recorre uno a uno; Escape vuelve al día', () => {
      montar(bloques);
      const dia = document.querySelector<HTMLElement>('[data-dia="2026-10-06"]') as HTMLElement;
      dia.focus();

      fireEvent.keyDown(dia, { key: 'ArrowDown' });
      expect((document.activeElement as HTMLElement).getAttribute('data-hueco')).toBe('2026-10-06T10:00');
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
      expect((document.activeElement as HTMLElement).getAttribute('data-hueco')).toBe('2026-10-06T12:00');
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
      expect((document.activeElement as HTMLElement).getAttribute('data-hueco')).toBe('2026-10-06T10:00');
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
      expect(document.activeElement).toBe(dia);
    });

    it('Flecha derecha desde un hueco pasa al día siguiente', () => {
      montar(bloques);
      const hueco = document.querySelector<HTMLElement>('[data-hueco="2026-10-06T10:00"]') as HTMLElement;
      hueco.focus();

      fireEvent.keyDown(hueco, { key: 'ArrowRight' });

      expect((document.activeElement as HTMLElement).getAttribute('data-dia')).toBe('2026-10-07');
    });
  });

  // H11 (ronda 3): con huecos que se pisan, la hora sigue siendo legible y «Elegida» siempre se ve.
  describe('legibilidad (H11)', () => {
    it('dos huecos que se pisan escriben solo la hora de inicio, sin recorte, y el rango completo en el title', () => {
      montar([bloque('2026-10-06', '17:00', 'libre', 90), bloque('2026-10-06', '18:00', 'libre', 90)]);

      const [a, b] = Array.from(document.querySelectorAll<HTMLElement>('button[data-hueco]'));
      expect(a.querySelector('.font-mono')?.textContent).toBe('17:00');
      expect(b.querySelector('.font-mono')?.textContent).toBe('18:00');
      expect(a.getAttribute('title')).toContain('17:00');
    });

    it('un hueco que no se pisa con nadie sigue enseñando su rango entero', () => {
      montar([bloque('2026-10-06', '17:00', 'libre')]);

      const hueco = document.querySelector<HTMLElement>('button[data-hueco]') as HTMLElement;
      expect(hueco.querySelector('.font-mono')?.textContent).toBe('17:00 – 17:50');
    });

    it('«Elegida» va antes que «Sugerida» y «Habitual»: es la que no se puede perder si el hueco es bajo', () => {
      montar([bloque('2026-10-06', '17:00', 'libre')], '2026-10-06T17:00');

      const texto = (document.querySelector('button[data-hueco]') as HTMLElement).textContent ?? '';
      expect(texto.indexOf('Elegida')).toBeGreaterThan(-1);
      expect(texto.indexOf('Elegida')).toBeLessThan(texto.indexOf('Sugerida'));
      expect(texto.indexOf('Elegida')).toBeLessThan(texto.indexOf('Habitual'));
    });
  });
});
