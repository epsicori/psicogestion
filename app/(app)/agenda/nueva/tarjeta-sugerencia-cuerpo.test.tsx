import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CuerpoSugerencia } from './tarjeta-sugerencia-cuerpo';

describe('tarjeta-sugerencia-cuerpo', () => {
  it('pinta los tres textos recibidos', () => {
    const { container } = render(<CuerpoSugerencia fecha="15 de enero" hora="10:00" motivo="Como las 3 últimas" />);

    expect(container.textContent).toBe('15 de enero10:00Como las 3 últimas');
  });

  it('la hora está en un elemento con clase font-mono', () => {
    const { container } = render(<CuerpoSugerencia fecha="15 de enero" hora="10:00" motivo="motivo" />);

    const horaElement = container.querySelector('.font-mono');
    expect(horaElement).not.toBeNull();
    expect(horaElement?.textContent).toBe('10:00');
  });

  it('no tiene ningún role en el contenedor', () => {
    const { container } = render(<CuerpoSugerencia fecha="fecha" hora="hora" motivo="motivo" />);

    expect(container.querySelector('[role]')).toBeNull();
  });

  it('solo contiene span: cabe dentro de un botón (E17)', () => {
    const { container } = render(<CuerpoSugerencia fecha="fecha" hora="hora" motivo="motivo" />);

    expect(container.querySelector('div')).toBeNull();
  });
});
