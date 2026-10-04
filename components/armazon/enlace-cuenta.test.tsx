import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CajonContext } from './cajon';
import { EnlaceCuenta } from './enlace-cuenta';

const ruta = vi.hoisted(() => ({ actual: '/pacientes' }));
vi.mock('next/navigation', () => ({ usePathname: () => ruta.actual }));

describe('EnlaceCuenta (T-038)', () => {
  beforeEach(() => {
    ruta.actual = '/pacientes';
  });

  it.each(['Ernes Pellus', 'Marta Gil', 'Alba Ruiz'])(
    'enlaza a /cuenta con un nombre accesible que empieza por «Mi cuenta» (%s)',
    (nombre) => {
      render(
        <EnlaceCuenta nombre={nombre} rolVisible="Rol">
          <span aria-hidden="true">EP</span>
        </EnlaceCuenta>,
      );

      const enlace = screen.getByRole('link', { name: /^Mi cuenta/ });
      expect(enlace).toHaveAttribute('href', '/cuenta');
      expect(enlace).toHaveAccessibleName(new RegExp(`^Mi cuenta.*${nombre}`));
      expect(enlace.className).toContain('min-h-11');
    },
  );

  it('sin estar en /cuenta no marca aria-current; en /cuenta sí', () => {
    const { rerender } = render(<EnlaceCuenta nombre="Ana" rolVisible="Rol" />);
    expect(screen.getByRole('link')).not.toHaveAttribute('aria-current');

    ruta.actual = '/cuenta';
    rerender(<EnlaceCuenta nombre="Ana" rolVisible="Rol" />);
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page');
  });

  it('al pulsarlo cierra el cajón de navegación', async () => {
    const cerrar = vi.fn();
    render(
      <CajonContext.Provider value={cerrar}>
        <EnlaceCuenta nombre="Ana" rolVisible="Rol" />
      </CajonContext.Provider>,
    );

    await userEvent.click(screen.getByRole('link'));

    expect(cerrar).toHaveBeenCalledTimes(1);
  });
});
