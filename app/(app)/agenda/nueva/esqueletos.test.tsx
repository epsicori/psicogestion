import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EsqueletoSerie, EsqueletoSeleccion, EsqueletoSugerencias, ErrorPieza } from './esqueletos';

describe('esqueletos', () => {
  it.each([
    ['sugerencias', EsqueletoSugerencias, 3],
    ['selección', EsqueletoSeleccion, 10],
    ['serie', EsqueletoSerie, 4],
  ])('el esqueleto de %s es un estado, dice «Cargando…» y respeta movimiento reducido', (_n, Pieza, franjas) => {
    const { container } = render(<Pieza />);

    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.textContent).toBe('Cargando…');
    expect(container.querySelectorAll('.motion-reduce\\:animate-none')).toHaveLength(franjas);
  });

  it('la pieza de error es una alerta con su mensaje', () => {
    const { container } = render(<ErrorPieza mensaje="Error de prueba" />);

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toBe('Error de prueba');
  });
});
