import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LeyendaSeleccion } from './leyenda-seleccion';

describe('leyenda-seleccion', () => {
  it('cinco elementos de lista con sus cinco textos', () => {
    render(<LeyendaSeleccion />);

    const textos = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(textos).toEqual(['Libre', 'Ocupado', 'Sugerida', 'Habitual', 'Elegida']);
  });

  it('cada muestra es decorativa y el texto no lo es', () => {
    const { container } = render(<LeyendaSeleccion />);

    const muestras = container.querySelectorAll('[aria-hidden="true"]');
    expect(muestras).toHaveLength(5);
    for (const muestra of muestras) expect(muestra.textContent).toBe('');
  });
});
