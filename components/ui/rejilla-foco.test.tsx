import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { destinoEnRejilla, useFocoRodante } from './rejilla-foco';

// Rejilla de 5 semanas × 7 días = 35 celdas; la 30 es la primera de la última fila.
const TOTAL = 35;

describe('destinoEnRejilla', () => {
  it('las flechas mueven una celda en horizontal y una fila en vertical', () => {
    expect(destinoEnRejilla('ArrowRight', 10, TOTAL)).toBe(11);
    expect(destinoEnRejilla('ArrowLeft', 10, TOTAL)).toBe(9);
    expect(destinoEnRejilla('ArrowDown', 10, TOTAL)).toBe(17);
    expect(destinoEnRejilla('ArrowUp', 10, TOTAL)).toBe(3);
  });

  it('Home y End van al principio y al final de la FILA', () => {
    expect(destinoEnRejilla('Home', 10, TOTAL)).toBe(7);
    expect(destinoEnRejilla('End', 10, TOTAL)).toBe(13);
  });

  it('End en una última fila incompleta va a la última celda que existe', () => {
    expect(destinoEnRejilla('End', 29, 31)).toBe(30);
  });

  it('no da la vuelta en ninguno de los cuatro bordes', () => {
    expect(destinoEnRejilla('ArrowLeft', 7, TOTAL)).toBeNull(); // borde izquierdo
    expect(destinoEnRejilla('ArrowRight', 13, TOTAL)).toBeNull(); // borde derecho
    expect(destinoEnRejilla('ArrowUp', 3, TOTAL)).toBeNull(); // borde superior
    expect(destinoEnRejilla('ArrowDown', 31, TOTAL)).toBeNull(); // borde inferior
    expect(destinoEnRejilla('ArrowLeft', 0, TOTAL)).toBeNull();
    expect(destinoEnRejilla('ArrowRight', 34, TOTAL)).toBeNull();
  });

  it('ArrowDown hacia una celda que no existe en una última fila incompleta: null', () => {
    expect(destinoEnRejilla('ArrowDown', 26, 31)).toBeNull();
  });

  it('otras teclas no son de navegación', () => {
    for (const tecla of ['Enter', ' ', 'Tab', 'a', 'PageDown']) {
      expect(destinoEnRejilla(tecla, 10, TOTAL)).toBeNull();
    }
  });

  it('acepta otro número de columnas (la tira de días)', () => {
    expect(destinoEnRejilla('ArrowDown', 1, 6, 3)).toBe(4);
    expect(destinoEnRejilla('End', 0, 6, 3)).toBe(2);
  });
});

function Rejilla() {
  const { activo, alTeclear, refDe } = useFocoRodante(14, 3);
  return (
    <div role="grid" onKeyDown={alTeclear}>
      {Array.from({ length: 14 }, (_, i) => (
        <button key={i} type="button" ref={refDe(i)} tabIndex={i === activo ? 0 : -1}>
          {`día ${i}`}
        </button>
      ))}
    </div>
  );
}

describe('useFocoRodante', () => {
  it('una sola celda tabulable; las flechas mueven el foco y el tabindex con él', async () => {
    const usuario = userEvent.setup();
    render(<Rejilla />);

    // Al montar no roba el foco.
    expect(document.activeElement).toBe(document.body);

    await usuario.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'día 3' }));

    await usuario.keyboard('{ArrowDown}');
    const diez = screen.getByRole('button', { name: 'día 10' });
    expect(document.activeElement).toBe(diez);
    expect(diez).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: 'día 3' })).toHaveAttribute('tabindex', '-1');

    // En el borde inferior no pasa nada.
    await usuario.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(diez);
  });
});
