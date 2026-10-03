import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AvisoNotas } from './aviso-notas';

describe('AvisoNotas', () => {
  it('con una nota atrasada, enlaza a la agenda con el recuento y el nombre en singular', () => {
    render(<AvisoNotas recuento={{ nivel1: 0, nivel2: 1, nivel3: 0 }} />);
    const enlace = screen.getByRole('link', { name: '1 nota sin firmar desde hace más de un día' });
    expect(enlace.getAttribute('href')).toBe('/agenda');
    expect(enlace.textContent).toContain('1');
  });

  it('cuenta los niveles 2 y 3, en plural', () => {
    render(<AvisoNotas recuento={{ nivel1: 5, nivel2: 2, nivel3: 1 }} />);
    expect(
      screen.getByRole('link', { name: '3 notas sin firmar desde hace más de un día' }),
    ).toBeTruthy();
  });

  it('gemela: el nivel 1 solo no enciende la cabecera (P2)', () => {
    const { container } = render(<AvisoNotas recuento={{ nivel1: 4, nivel2: 0, nivel3: 0 }} />);
    expect(container.innerHTML).toBe('');
  });

  it('con ceros no pinta nada: ningún control sin dato', () => {
    const { container } = render(<AvisoNotas recuento={{ nivel1: 0, nivel2: 0, nivel3: 0 }} />);
    expect(container.innerHTML).toBe('');
  });
});
