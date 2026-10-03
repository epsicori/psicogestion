import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ArmazonCliente } from './armazon-cliente';
import { EnlaceCuenta } from './enlace-cuenta';

vi.mock('next/navigation', () => ({ usePathname: () => '/pacientes' }));

/**
 * B-H1 (T-038). El enlace «Mi cuenta» vive en el pie del `<aside>`, FUERA de la
 * navegación: si el proveedor del cajón solo envuelve la navegación, pulsarlo no cierra
 * el cajón en móvil. Se monta el armazón REAL; la prueba de `enlace-cuenta.test.tsx` solo
 * demuestra que el enlace llama a lo que le den, no que el armazón se lo dé.
 */
describe('ArmazonCliente · cajón y enlace de cuenta (B-H1)', () => {
  it('pulsar «Mi cuenta» cierra el cajón: el velo desaparece', async () => {
    render(
      <ArmazonCliente
        selectorCentro={null}
        navegacion={null}
        identidad={<EnlaceCuenta nombre="Ana" rolVisible="Rol" />}
        saludo={null}
        avisos={null}
        franja={null}
      >
        <p>contenido</p>
      </ArmazonCliente>,
    );
    const usuario = userEvent.setup();

    expect(screen.getAllByRole('button', { name: 'Cerrar menú' })).toHaveLength(1);

    await usuario.click(screen.getByRole('button', { name: 'Abrir menú' }));
    // Abierto: el velo y la X del cajón.
    expect(screen.getAllByRole('button', { name: 'Cerrar menú' })).toHaveLength(2);

    await usuario.click(screen.getByRole('link', { name: /^Mi cuenta/ }));
    // Cerrado: solo queda la X (siempre en el DOM, oculta con CSS en escritorio).
    expect(screen.getAllByRole('button', { name: 'Cerrar menú' })).toHaveLength(1);
  });
});
