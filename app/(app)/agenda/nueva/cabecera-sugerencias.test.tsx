import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CabeceraSugerencias } from './cabecera-sugerencias';

describe('cabecera-sugerencias', () => {
  it('en modo habitual muestra Sugerencias', () => {
    const { container } = render(<CabeceraSugerencias modo="habitual" />);

    const heading = container.querySelector('h3');
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe('Sugerencias');
  });

  it('en frío el encabezado es exactamente «Primeros huecos libres» y, fuera de la ayuda, no sale «habitual» (E17)', () => {
    const { container } = render(<CabeceraSugerencias modo="enFrio" />);

    const heading = container.querySelector('h3');
    expect(heading?.textContent).toBe('Primeros huecos libres');
    const ayuda = container.querySelector('p');
    const fueraDeLaAyuda = [...container.querySelectorAll('*')]
      .filter((el) => el !== ayuda && !ayuda?.contains(el) && el.children.length === 0)
      .map((el) => el.textContent)
      .join(' ');
    expect(fueraDeLaAyuda).not.toMatch(/habitual/i);
  });

  it('en modo enFrio muestra el párrafo de ayuda', () => {
    const { container } = render(<CabeceraSugerencias modo="enFrio" />);

    expect(container.querySelector('p')?.textContent).toBe(
      'Aún no hay citas suficientes para saber su hora habitual.',
    );
  });

  it('en modo habitual no hay párrafo de ayuda', () => {
    const { container } = render(<CabeceraSugerencias modo="habitual" />);

    expect(container.querySelector('p')).toBeNull();
  });
});
