import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n';

import { LeyendaEstadosCita, PuntoEstadoCita, type EstadoVisibleCita } from './estado-cita';

const ESTADOS: EstadoVisibleCita[] = [
  'programada',
  'confirmada',
  'en_curso',
  'realizada',
  'cancelada',
  'no_asistida',
];

/** Las clases que solo ponen color. Lo que queda al quitarlas es la forma. */
const esDeColor = (clase: string) =>
  ['primary', 'accent', 'destructive', 'muted-foreground'].some((c) => clase.includes(c));

describe('PuntoEstadoCita', () => {
  // El estado nunca va solo en color: cada uno pinta su etiqueta del catálogo.
  it.each(ESTADOS)('pinta la etiqueta de %s', (estado) => {
    render(<PuntoEstadoCita estado={estado} />);

    expect(screen.getByText(t(`agenda.estados.${estado}`))).not.toHaveClass('sr-only');
  });

  // ADR-047: un único elemento animado por pantalla, y es la cita en curso.
  it('solo «en curso» lleva el latido', () => {
    for (const estado of ESTADOS) {
      const { container, unmount } = render(<PuntoEstadoCita estado={estado} />);
      expect(container.querySelector('.latido-estado') !== null).toBe(estado === 'en_curso');
      unmount();
    }
  });

  // T-014: en el panel, la lista del día y las próximas el punto no late (un solo latido por pantalla).
  it('con late={false}, «en curso» lleva el halo quieto y no el latido', () => {
    const { container } = render(<PuntoEstadoCita estado="en_curso" late={false} />);
    const punto = container.querySelector('[data-forma="en_curso"]');
    expect(punto).toHaveClass('halo-estado');
    expect(punto).not.toHaveClass('latido-estado');
  });

  // Sin etiqueta visible, el lector de pantalla sigue oyendo el estado.
  it('con conEtiqueta={false} la etiqueta sigue en el DOM como sr-only', () => {
    render(<PuntoEstadoCita estado="programada" conEtiqueta={false} />);

    expect(screen.getByText(t('agenda.estados.programada'))).toHaveClass('sr-only');
  });

  // El punto es decoración: si no, el lector anunciaría un span vacío antes de la etiqueta.
  it('el punto lleva aria-hidden', () => {
    const { container } = render(<PuntoEstadoCita estado="cancelada" />);

    expect(container.querySelector('[data-forma="cancelada"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});

describe('LeyendaEstadosCita', () => {
  // La leyenda explica los seis sin robarle el latido a la cita en curso de verdad.
  it('tiene seis elementos y ninguno late', () => {
    render(<LeyendaEstadosCita />);

    const lista = screen.getByRole('list', { name: t('agenda.leyendaEstados') });
    const elementos = screen.getAllByRole('listitem');
    expect(elementos).toHaveLength(6);
    expect(lista.querySelector('.latido-estado')).toBeNull();
  });

  // «En curso» quieto se distingue de «realizada» por el halo, no por el movimiento.
  it('en la leyenda, «en curso» lleva el halo quieto', () => {
    const { container } = render(<LeyendaEstadosCita />);

    expect(container.querySelector('[data-forma="en_curso"]')).toHaveClass('halo-estado');
  });

  // En gris (o impreso) los seis siguen siendo seis formas distintas.
  it('los seis puntos se distinguen sin color', () => {
    const { container } = render(<LeyendaEstadosCita />);

    const formas = ESTADOS.map((estado) => {
      const punto = container.querySelector(`[data-forma="${estado}"]`);
      const clases = [...(punto?.classList ?? [])].filter((c) => !esDeColor(c)).sort();
      return `${clases.join(' ')}|${punto?.childElementCount ?? 0}`;
    });

    expect(new Set(formas).size).toBe(6);
  });
});
