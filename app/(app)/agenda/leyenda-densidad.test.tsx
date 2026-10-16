import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n';

import { ANCHO, FONDO, LeyendaDensidad } from './leyenda-densidad';

describe('LeyendaDensidad', () => {
  const entradas = [
    { nivel: 0 as const, texto: '0' },
    { nivel: 1 as const, texto: '1–3' },
    { nivel: 2 as const, texto: '4–6' },
    { nivel: 3 as const, texto: '7–9' },
    { nivel: 4 as const, texto: '10–12' },
  ];

  it('pinta un elemento de lista por entrada, con su texto numérico', () => {
    render(<LeyendaDensidad entradas={entradas} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    for (const e of entradas) expect(screen.getByText(e.texto)).toBeInTheDocument();
  });

  it('cada muestra va oculta al lector y lleva el fondo de su nivel', () => {
    const { container } = render(<LeyendaDensidad entradas={entradas} />);
    container.querySelectorAll('li').forEach((item, i) => {
      const muestra = item.firstElementChild;
      expect(muestra).toHaveAttribute('aria-hidden', 'true');
      const fondo = FONDO[entradas[i].nivel];
      if (fondo) expect(muestra?.className).toContain(fondo);
      else expect(muestra?.className).not.toContain('bg-densidad');
    });
  });

  it('cada barra lleva el ancho de su nivel', () => {
    const { container } = render(<LeyendaDensidad entradas={entradas} />);
    container.querySelectorAll('li').forEach((item, i) => {
      const barra = item.querySelector(':scope > span > span');
      expect(barra?.className).toContain(ANCHO[entradas[i].nivel]);
    });
  });

  it('sin entradas no pinta nada', () => {
    const { container } = render(<LeyendaDensidad entradas={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('muestra el título de la leyenda', () => {
    render(<LeyendaDensidad entradas={entradas} />);
    expect(screen.getByText(t('agenda.anio.leyenda.titulo'))).toBeInTheDocument();
  });
});
