import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('el objetivo táctil es de 44 px en los dos tamaños', () => {
    render(
      <>
        <Button tamano="sm">Ampliar</Button>
        <Button tamano="md">Cerrar la historia</Button>
      </>,
    );

    // 44 px es el criterio del ADR-044, y lo cumple la primitiva para que ninguna pantalla
    // tenga que acordarse. Antes eran 32 y 40 px, y la ficha del paciente lo parcheaba con
    // un `min-h-11` suelto que se olvidaría en la siguiente pantalla.
    expect(screen.getByRole('button', { name: 'Ampliar' }).className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'Cerrar la historia' }).className).toContain(
      'min-h-11',
    );
  });

  it('no envía el formulario por accidente: sin `type` es un botón normal', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('type', 'button');
  });

  it('se alcanza con Tab y se activa con Intro, sin tocar el ratón', async () => {
    const usuario = userEvent.setup();
    let pulsado = 0;
    render(<Button onClick={() => (pulsado += 1)}>Firmar</Button>);

    await usuario.tab();
    expect(screen.getByRole('button', { name: 'Firmar' })).toHaveFocus();
    await usuario.keyboard('{Enter}');
    expect(pulsado).toBe(1);
  });

  it('deshabilitado no recibe el clic', async () => {
    const usuario = userEvent.setup();
    let pulsado = 0;
    render(
      <Button disabled onClick={() => (pulsado += 1)}>
        Firmar
      </Button>,
    );

    await usuario.click(screen.getByRole('button', { name: 'Firmar' }));
    expect(pulsado).toBe(0);
  });
});
