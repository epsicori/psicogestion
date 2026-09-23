import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Seleccion } from './seleccion';

const OPCIONES = [
  { valor: 'hombre', texto: 'Hombre' },
  { valor: 'mujer', texto: 'Mujer' },
  { valor: 'otro', texto: 'Otro' },
];

describe('Seleccion', () => {
  it('la etiqueta está asociada al control', () => {
    render(<Seleccion id="sexo" etiqueta="Sexo" opciones={OPCIONES} />);
    expect(screen.getByLabelText('Sexo')).toBeInstanceOf(HTMLSelectElement);
  });

  it('empieza con una opción vacía, que es lo que hace que «opcional» sea verdad', () => {
    render(<Seleccion id="sexo" etiqueta="Sexo" opciones={OPCIONES} />);
    const control = screen.getByLabelText('Sexo') as HTMLSelectElement;
    expect(control.options[0].value).toBe('');
    expect(control.value).toBe('');
  });

  it('la opción vacía tiene texto: un lector no la anuncia como «en blanco» (H8)', () => {
    render(<Seleccion id="sexo" etiqueta="Sexo" opciones={OPCIONES} />);
    const control = screen.getByLabelText('Sexo') as HTMLSelectElement;
    expect(control.options[0].textContent).toBe('Sin indicar');
  });

  it('el control mide al menos 44 px de alto, como Button y Desplegable (ADR-044, H8)', () => {
    render(<Seleccion id="sexo" etiqueta="Sexo" opciones={OPCIONES} />);
    const control = screen.getByLabelText('Sexo');
    expect(control).toHaveClass('min-h-11');
    expect(control).not.toHaveClass('h-10');
  });

  it('se puede elegir una opción con el teclado', async () => {
    const usuario = userEvent.setup();
    render(<Seleccion id="sexo" etiqueta="Sexo" opciones={OPCIONES} />);
    const control = screen.getByLabelText('Sexo') as HTMLSelectElement;

    await usuario.selectOptions(control, 'mujer');
    expect(control.value).toBe('mujer');
  });

  it('con errores, el control queda aria-invalid y el párrafo se anuncia', () => {
    render(
      <Seleccion id="sexo" etiqueta="Sexo" opciones={OPCIONES} errores={['Elige una opción']} />,
    );
    const control = screen.getByLabelText('Sexo');

    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAttribute('aria-describedby', 'sexo-error');
    expect(screen.getByText('Elige una opción')).toHaveAttribute('id', 'sexo-error');
  });
});
