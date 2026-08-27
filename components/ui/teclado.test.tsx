import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

// PLANTILLA para T-007: ninguna primitiva de `components/ui/` tiene todavía
// comportamiento de diálogo, así que esta prueba monta un `<dialog>` mínimo aquí
// dentro. T-007 reapunta tabulación, Escape y devolución de foco a la primitiva real.
function DialogoMinimo() {
  const [abierto, setAbierto] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);

  const cerrar = () => {
    setAbierto(false);
    // Al cerrar, el foco vuelve al disparador: sin esto, quien navega con teclado
    // pierde el punto de la página donde estaba.
    disparador.current?.focus();
  };

  return (
    <>
      <button ref={disparador} onClick={() => setAbierto(true)}>
        Abrir
      </button>
      {abierto && (
        <dialog
          open
          onKeyDown={(evento) => {
            if (evento.key === 'Escape') cerrar();
          }}
        >
          <button onClick={cerrar}>Cerrar</button>
        </dialog>
      )}
    </>
  );
}

describe('plantilla de teclado para las primitivas de T-007', () => {
  it('tabula al disparador, abre, cierra con Escape y devuelve el foco', async () => {
    const user = userEvent.setup();
    render(<DialogoMinimo />);

    const botonAbrir = screen.getByRole('button', { name: 'Abrir' });

    await user.tab();
    expect(botonAbrir).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(botonAbrir).toHaveFocus();
  });
});
