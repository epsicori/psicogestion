import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Menu } from './menu';

function montar(alElegirEditar = vi.fn()) {
  render(
    <>
      <button type="button">Del fondo</button>
      <Menu
        disparador="Acciones"
        opciones={[
          { id: 'editar', etiqueta: 'Editar', alElegir: alElegirEditar },
          { id: 'duplicar', etiqueta: 'Duplicar', alElegir: () => {} },
          { id: 'borrar', etiqueta: 'Borrar', alElegir: () => {}, destructiva: true },
        ]}
      />
    </>,
  );
  return { disparador: screen.getByRole('button', { name: 'Acciones' }), alElegirEditar };
}

describe('Menu', () => {
  it('se abre con la flecha abajo y el foco cae en la primera opción', async () => {
    const usuario = userEvent.setup();
    const { disparador } = montar();

    expect(disparador).toHaveAttribute('aria-expanded', 'false');

    disparador.focus();
    await usuario.keyboard('{ArrowDown}');

    expect(disparador).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Editar' }));
  });

  it('la flecha arriba abre por el final, y las flechas dan la vuelta', async () => {
    const usuario = userEvent.setup();
    const { disparador } = montar();

    disparador.focus();
    await usuario.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Borrar' }));

    await usuario.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Editar' }));

    await usuario.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Borrar' }));
  });

  it('Escape cierra y el foco vuelve al disparador', async () => {
    const usuario = userEvent.setup();
    const { disparador } = montar();

    disparador.focus();
    await usuario.keyboard('{ArrowDown}');

    // Control: antes de cerrar el foco NO está en el disparador.
    expect(document.activeElement).not.toBe(disparador);

    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(disparador);
  });

  it('Tab no tabula dentro del menú: cierra y devuelve el foco', async () => {
    const usuario = userEvent.setup();
    const { disparador } = montar();

    disparador.focus();
    await usuario.keyboard('{ArrowDown}');
    await usuario.tab();

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(disparador);
  });

  it('elegir una opción la ejecuta y cierra', async () => {
    const usuario = userEvent.setup();
    const { disparador, alElegirEditar } = montar();

    disparador.focus();
    await usuario.keyboard('{ArrowDown}');
    await usuario.click(screen.getByRole('menuitem', { name: 'Editar' }));

    expect(alElegirEditar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('el clic fuera cierra sin ejecutar nada', async () => {
    const usuario = userEvent.setup();
    const { disparador, alElegirEditar } = montar();

    await usuario.click(disparador);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Del fondo' }));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(alElegirEditar).not.toHaveBeenCalled();
  });
});
