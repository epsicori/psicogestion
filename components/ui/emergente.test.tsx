import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Emergente } from './emergente';

function montar() {
  render(
    <>
      <button type="button">Del fondo</button>
      <Emergente disparador="Ver resumen" titulo="Resumen de la cita">
        <button type="button">Abrir ficha</button>
        <button type="button">Copiar hora</button>
      </Emergente>
    </>,
  );
  return screen.getByRole('button', { name: 'Ver resumen' });
}

describe('Emergente', () => {
  it('al abrir, el foco entra en el panel', async () => {
    const usuario = userEvent.setup();
    const disparador = montar();

    expect(disparador).toHaveAttribute('aria-expanded', 'false');

    await usuario.click(disparador);

    const panel = screen.getByRole('dialog');
    expect(disparador).toHaveAttribute('aria-expanded', 'true');
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('el foco no se escapa al fondo aunque el emergente no sea modal', async () => {
    const usuario = userEvent.setup();
    const disparador = montar();
    await usuario.click(disparador);

    const panel = screen.getByRole('dialog');
    const delFondo = screen.getByRole('button', { name: 'Del fondo' });

    for (let i = 0; i < 6; i++) {
      await usuario.tab();
      expect(panel.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(delFondo);
    }
  });

  it('Escape cierra y el foco vuelve al disparador', async () => {
    const usuario = userEvent.setup();
    const disparador = montar();
    await usuario.click(disparador);

    // Control: el foco está dentro del panel, no en el disparador.
    expect(document.activeElement).not.toBe(disparador);

    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(disparador);
  });

  it('el clic fuera cierra', async () => {
    const usuario = userEvent.setup();
    const disparador = montar();
    await usuario.click(disparador);

    await usuario.click(screen.getByRole('button', { name: 'Del fondo' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('el panel se anuncia con su título', async () => {
    const usuario = userEvent.setup();
    await usuario.click(montar());

    const panel = screen.getByRole('dialog');
    const titulo = screen.getByText('Resumen de la cita');
    expect(panel).toHaveAttribute('aria-labelledby', titulo.id);
  });
});
