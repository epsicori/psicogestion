import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SelloDeNota } from './sello-de-nota';

describe('SelloDeNota', () => {
  // Pinta la frase recibida
  it('muestra la frase recibida', () => {
    const { container } = render(
      <SelloDeNota frase="Frase de prueba" enSesion={true} />
    );
    expect(container.textContent).toBe('Frase de prueba');
  });

  // Cada caso de enSesion tiene exactamente un svg con aria-hidden
  it.each([
    { enSesion: true, nombre: 'true' },
    { enSesion: false, nombre: 'false' },
    { enSesion: null, nombre: 'null' },
  ])('enSesion=$nombre tiene un svg con aria-hidden', ({ enSesion }) => {
    const { container } = render(
      <SelloDeNota frase="Test" enSesion={enSesion} />
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
  });

  // Los tres casos dan svg distintos
  it('los tres casos de enSesion usan iconos distintos', () => {
    const { container: c1 } = render(<SelloDeNota frase="A" enSesion={true} />);
    const { container: c2 } = render(<SelloDeNota frase="B" enSesion={false} />);
    const { container: c3 } = render(<SelloDeNota frase="C" enSesion={null} />);

    const svg1 = c1.querySelector('svg')?.innerHTML;
    const svg2 = c2.querySelector('svg')?.innerHTML;
    const svg3 = c3.querySelector('svg')?.innerHTML;

    expect(svg1).not.toBe(svg2);
    expect(svg2).not.toBe(svg3);
    expect(svg1).not.toBe(svg3);
  });

  // Ningún elemento tiene rol ARIA
  it('no tiene elementos con rol ARIA', () => {
    const { container } = render(
      <SelloDeNota frase="Test" enSesion={true} />
    );
    const roles = container.querySelectorAll('[role]');
    expect(roles).toHaveLength(0);
  });
});
