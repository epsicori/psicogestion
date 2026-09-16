import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AreaTexto } from './area-texto';

describe('AreaTexto', () => {
  it('la etiqueta está asociada al control', () => {
    render(<AreaTexto id="alergias" etiqueta="Alergias" />);
    expect(screen.getByLabelText('Alergias')).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('sin errores, el control no lleva aria-invalid ni aria-describedby', () => {
    render(<AreaTexto id="alergias" etiqueta="Alergias" />);
    const control = screen.getByLabelText('Alergias');
    expect(control).not.toHaveAttribute('aria-invalid');
    expect(control).not.toHaveAttribute('aria-describedby');
  });

  it('con errores, el control queda aria-invalid y el párrafo se anuncia', () => {
    render(<AreaTexto id="alergias" etiqueta="Alergias" errores={['Demasiado largo']} />);
    const control = screen.getByLabelText('Alergias');

    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAttribute('aria-describedby', 'alergias-error');
    expect(screen.getByText('Demasiado largo')).toHaveAttribute('id', 'alergias-error');
  });
});
