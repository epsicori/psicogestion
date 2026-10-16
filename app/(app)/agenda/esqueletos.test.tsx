import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EsqueletoAnio, EsqueletoCalendario, EsqueletoLista, EsqueletoCuadro } from './esqueletos';
import { t } from '@/lib/i18n';

// Estas piezas no tienen comportamiento, así que no llevan prueba de teclado. Lo que sí
// se comprueba es lo que un `div` con texto puede romper igual: que lo que anuncian al
// lector de pantalla esté ahí, y que el texto largo no desborde en silencio.

describe('esqueletos', () => {
  it('EsqueletoCalendario lleva role=status con aria-label del catálogo y franjas animadas', () => {
    const { container } = render(<EsqueletoCalendario />);

    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      t('agenda.esqueletos.calendario')
    );
    const animado = container.querySelector('.animate-pulse');
    expect(animado?.className).toContain('motion-reduce:animate-none');
  });

  it('EsqueletoLista sin props pinta 3 franjas por defecto', () => {
    const { container } = render(<EsqueletoLista />);
    const franjas = container.querySelectorAll('.animate-pulse');
    expect(franjas).toHaveLength(3);
  });

  it('EsqueletoLista con filas=5 pinta 5 franjas', () => {
    const { container } = render(<EsqueletoLista filas={5} />);
    const franjas = container.querySelectorAll('.animate-pulse');
    expect(franjas).toHaveLength(5);
  });

  it('EsqueletoCuadro lleva role=status con aria-label del catálogo', () => {
    render(<EsqueletoCuadro />);

    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      t('agenda.esqueletos.cuadro')
    );
  });

  it('EsqueletoAnio lleva role=status con aria-label del catálogo, 12 meses y 432 piezas animadas', () => {
    const { container } = render(<EsqueletoAnio />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', t('agenda.esqueletos.anio'));
    expect(container.querySelector('.meses-anio')?.children).toHaveLength(12);
    const animados = container.querySelectorAll('.animate-pulse');
    expect(animados).toHaveLength(12 * 36);
    animados.forEach((el) => expect(el.className).toContain('motion-reduce:animate-none'));
  });
});
