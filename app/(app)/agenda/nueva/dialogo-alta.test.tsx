import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: m.back }) }));

import { DialogoAlta } from './dialogo-alta';

beforeEach(() => vi.clearAllMocks());

describe('DialogoAlta', () => {
  it('abre un diálogo modal titulado «Nueva cita» con su contenido, amplio', () => {
    render(
      <DialogoAlta>
        <p>Formulario</p>
      </DialogoAlta>,
    );

    const dialogo = screen.getByRole('dialog', { name: 'Nueva cita' });
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    expect(dialogo.textContent).toContain('Formulario');
    expect(dialogo.className).toContain('max-w-5xl');
  });

  it('Escape y la «X» cierran volviendo atrás', async () => {
    const usuario = userEvent.setup();
    render(
      <DialogoAlta>
        <p>Formulario</p>
      </DialogoAlta>,
    );

    await usuario.keyboard('{Escape}');
    expect(m.back).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(m.back).toHaveBeenCalledTimes(2);
  });
});
