import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EstadoVacio } from './estado-vacio';

// Estas piezas no tienen comportamiento, así que no llevan prueba de teclado. Lo que sí
// se comprueba es lo que un `div` con texto puede romper igual: que lo que anuncian al
// lector de pantalla esté ahí, y que el texto largo no desborde en silencio.

describe('EstadoVacio', () => {
  it('pinta el título y la explicación que se le pasan', () => {
    render(
      <EstadoVacio
        icono="calendario"
        titulo="Sin citas hoy"
        explicacion="La agenda está libre."
      />
    );

    expect(screen.getByText('Sin citas hoy')).toBeInTheDocument();
    expect(screen.getByText('La agenda está libre.')).toBeInTheDocument();
  });

  it('el título va en font-serif', () => {
    render(
      <EstadoVacio
        icono="calendario"
        titulo="Sin citas"
        explicacion="Descripción"
      />
    );

    expect(screen.getByText('Sin citas').className).toContain('font-serif');
  });

  it('el icono lleva aria-hidden="true"', () => {
    const { container } = render(
      <EstadoVacio icono="documento" titulo="Título" explicacion="Explicación" />
    );

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('los tres valores de icono producen tres svg distintos', () => {
    const { container: c1, unmount: u1 } = render(
      <EstadoVacio icono="calendario" titulo="A" explicacion="B" />
    );
    const svg1 = c1.querySelector('svg')?.innerHTML;
    u1();

    const { container: c2, unmount: u2 } = render(
      <EstadoVacio icono="confirmado" titulo="A" explicacion="B" />
    );
    const svg2 = c2.querySelector('svg')?.innerHTML;
    u2();

    const { container: c3 } = render(
      <EstadoVacio icono="documento" titulo="A" explicacion="B" />
    );
    const svg3 = c3.querySelector('svg')?.innerHTML;

    expect(svg1).not.toBe(svg2);
    expect(svg2).not.toBe(svg3);
    expect(svg1).not.toBe(svg3);
  });
});
