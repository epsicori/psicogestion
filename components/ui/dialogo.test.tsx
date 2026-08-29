import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Dialogo } from './dialogo';

// El diálogo se monta SIEMPRE desde un disparador con estado real. Renderizarlo ya abierto
// y enfocar a mano deja pruebas que pasan por el motivo equivocado: el foco estaría donde
// lo puso la prueba, no donde lo devolvió el componente.
function Montaje() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir
      </button>
      <button type="button">Del fondo</button>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Ficha">
        <button type="button">Guardar</button>
        <button type="button">Descartar</button>
      </Dialogo>
    </>
  );
}

const abrir = async (usuario: ReturnType<typeof userEvent.setup>) => {
  await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
  return screen.getByRole('dialog');
};

describe('Dialogo', () => {
  it('al abrir, el foco entra en el diálogo', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    const dialogo = await abrir(usuario);

    expect(document.activeElement).not.toBeNull();
    expect(dialogo.contains(document.activeElement)).toBe(true);
  });

  it('Tab circula dentro del diálogo y no alcanza lo que hay detrás', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    const dialogo = await abrir(usuario);
    const delFondo = screen.getByRole('button', { name: 'Del fondo' });
    const disparador = screen.getByRole('button', { name: 'Abrir' });

    // Una vuelta entera y una más: si la trampa no cerrara el ciclo, en alguna de estas
    // el foco habría salido al fondo.
    for (let i = 0; i < 8; i++) {
      await usuario.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(delFondo);
      expect(document.activeElement).not.toBe(disparador);
    }

    // Y hacia atrás desde el primero, que es donde se escapan las trampas mal escritas.
    for (let i = 0; i < 8; i++) {
      await usuario.tab({ shift: true });
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
  });

  it('Escape cierra y el foco vuelve al disparador', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    const disparador = screen.getByRole('button', { name: 'Abrir' });
    const dialogo = await abrir(usuario);

    // Control: antes de cerrar, el foco NO está en el disparador. Sin esta línea, la
    // aserción de abajo pasaría aunque el componente no devolviera nada.
    expect(dialogo.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(disparador);

    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(disparador);
  });

  it('el clic fuera cierra; el clic dentro del panel no', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    await abrir(usuario);

    // Dentro: sigue abierto.
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Fuera: cierra. Se pulsa el velo, que es el padre del panel.
    const velo = screen.getByRole('dialog').parentElement;
    expect(velo).not.toBeNull();
    if (velo) await usuario.click(velo);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('el botón de cerrar es un objetivo táctil de 44 px y anuncia su función', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);
    await abrir(usuario);

    const cerrar = screen.getByRole('button', { name: 'Cerrar' });
    expect(cerrar.className).toContain('min-h-11');
    expect(cerrar.className).toContain('min-w-11');

    await usuario.click(cerrar);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
