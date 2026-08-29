import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Casilla } from './casilla';

function Montaje() {
  const [marcada, setMarcada] = useState(false);
  return (
    <Casilla
      etiqueta="Consentimiento firmado"
      checked={marcada}
      onChange={(evento) => setMarcada(evento.target.checked)}
    />
  );
}

describe('Casilla', () => {
  it('se alcanza con Tab y se marca con Espacio, sin tocar el ratón', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    const casilla = screen.getByRole('checkbox', { name: 'Consentimiento firmado' });
    expect(casilla).not.toBeChecked();

    await usuario.tab();
    expect(document.activeElement).toBe(casilla);

    await usuario.keyboard(' ');
    expect(casilla).toBeChecked();

    await usuario.keyboard(' ');
    expect(casilla).not.toBeChecked();
  });

  it('la etiqueta está asociada de verdad: pulsarla marca la casilla', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    await usuario.click(screen.getByText('Consentimiento firmado'));
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('el objetivo táctil es la etiqueta entera, de 44 px', () => {
    render(<Montaje />);
    const etiqueta = screen.getByText('Consentimiento firmado');
    expect(etiqueta.className).toContain('min-h-11');
  });

  it('el estado indeterminado se pone por propiedad, que es la única forma que hay', () => {
    render(<Casilla etiqueta="Algunas" indeterminada readOnly checked={false} />);
    const casilla = screen.getByRole('checkbox', { name: 'Algunas' });
    expect(casilla).toBeInstanceOf(HTMLInputElement);
    expect((casilla as HTMLInputElement).indeterminate).toBe(true);
  });
});
