import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EsqueletoEditor } from './esqueleto-editor';

describe('EsqueletoEditor', () => {
  // Verifica que existe exactamente un elemento con role="status" (Cargando)
  it('renderiza un único role="status"', () => {
    render(<EsqueletoEditor />);
    const estados = screen.getAllByRole('status');
    expect(estados).toHaveLength(1);
  });

  // Verifica que no hay botones ni enlaces en el esqueleto
  it('no renderiza botones ni enlaces', () => {
    render(<EsqueletoEditor />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  // Verifica que todo elemento con animate-pulse tiene motion-reduce:animate-none
  it('los elementos con animate-pulse incluyen motion-reduce:animate-none', () => {
    render(<EsqueletoEditor />);
    const conPulso = document.querySelectorAll('.animate-pulse');
    conPulso.forEach((el) => {
      expect(el.classList.contains('motion-reduce:animate-none')).toBe(true);
    });
  });
});
