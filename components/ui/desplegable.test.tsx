import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Desplegable } from './desplegable';

const CENTROS = [
  { valor: 'a', etiqueta: 'Centro A' },
  { valor: 'b', etiqueta: 'Centro B' },
  { valor: 'c', etiqueta: 'Centro C' },
];

function Montaje() {
  const [valor, setValor] = useState<string | null>(null);
  return (
    <>
      <button type="button">Del fondo</button>
      <Desplegable opciones={CENTROS} valor={valor} alElegir={setValor} etiqueta="Centro" />
    </>
  );
}

const disparador = () => screen.getByRole('combobox');

describe('Desplegable', () => {
  it('sin elegir enseña el marcador, y anuncia que está cerrado', () => {
    render(<Montaje />);
    expect(disparador()).toHaveAttribute('aria-expanded', 'false');
    expect(disparador()).toHaveTextContent('Selecciona…');
  });

  it('se abre con el teclado y se elige con Enter, sin ratón', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    disparador().focus();
    await usuario.keyboard('{ArrowDown}');

    expect(disparador()).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Centro A' }));

    await usuario.keyboard('{ArrowDown}{Enter}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(disparador()).toHaveTextContent('Centro B');
  });

  it('lo elegido queda marcado como seleccionado para el lector de pantalla', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    disparador().focus();
    await usuario.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await usuario.keyboard('{ArrowDown}');

    expect(screen.getByRole('option', { name: 'Centro B' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'Centro A' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('Escape cierra sin elegir y el foco vuelve al disparador', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    disparador().focus();
    await usuario.keyboard('{ArrowDown}{ArrowDown}');

    // Control: el foco está en una opción, no en el disparador.
    expect(document.activeElement).not.toBe(disparador());

    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(disparador());
    expect(disparador()).toHaveTextContent('Selecciona…');
  });

  it('el clic fuera cierra sin elegir', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    await usuario.click(disparador());
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Del fondo' }));

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(disparador()).toHaveTextContent('Selecciona…');
  });
});
