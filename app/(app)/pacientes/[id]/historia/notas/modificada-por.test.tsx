import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModificadaPor } from './modificada-por';
import { tCon } from '@/lib/i18n';

describe('ModificadaPor', () => {
  // Pinta la frase con los valores sustituidos
  it('muestra la frase con fecha y autor substituidos', () => {
    const fecha = '14/10/2026 09:15';
    const autor = 'Dr. López';

    render(<ModificadaPor fecha={fecha} autor={autor} />);

    expect(
      screen.getByText(tCon('notas.modificadaPor', { fecha, autor }))
    ).toBeInTheDocument();
  });

  // El svg tiene aria-hidden
  it('el icono tiene aria-hidden', () => {
    const { container } = render(
      <ModificadaPor fecha="14/10/2026" autor="Dr. López" />
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
