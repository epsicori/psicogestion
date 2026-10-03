import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ resolverAlerta: vi.fn() }));

vi.mock('./acciones-alertas', () => ({ resolverAlerta: m.resolverAlerta }));

import { ProveedorResolucion, ResolverAlerta } from './resolver-alerta';

const ALERTA = '11111111-1111-4111-8111-111111111111';
const NOMBRE_BOTON = 'Marcar como resuelta: Consentimiento por firmar';

function Bloque({ conFila }: { conFila: boolean }) {
  return (
    <section aria-labelledby="agenda-documentacion">
      <h2 id="agenda-documentacion">Documentación pendiente</h2>
      <ProveedorResolucion>
        {conFila && (
          <ul>
            <li>
              <ResolverAlerta alertaId={ALERTA} etiquetaTipo="Consentimiento por firmar" />
            </li>
          </ul>
        )}
      </ProveedorResolucion>
    </section>
  );
}

function estadoFila(): HTMLElement {
  return screen.getByRole('button', { name: NOMBRE_BOTON }).closest('form')!.querySelector('[role="status"]')!;
}

function estadoBloque(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-estado-bloque]')!;
}

async function pulsar() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: NOMBRE_BOTON }));
  });
}

function diferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

describe('ResolverAlerta: fallos (T-015, R3)', () => {
  beforeEach(() => {
    m.resolverAlerta.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it.each([
    ['la acción rechaza', () => m.resolverAlerta.mockRejectedValue(new Error('red'))],
    ['la acción da ok:false', () => m.resolverAlerta.mockResolvedValue({ ok: false, error: 'fallo' })],
  ])('si %s: no se lanza nada, el botón sigue y se anuncia el error', async (_nombre, preparar) => {
    preparar();
    render(<Bloque conFila />);
    await pulsar();

    expect(estadoFila().textContent).toBe('No se ha podido marcar como resuelta.');
    expect(screen.getByRole('button', { name: NOMBRE_BOTON })).toBeTruthy();
    // Un fallo no es un éxito: nada en el status del bloque.
    expect(estadoBloque().textContent).toBe('');
  });

  it('un segundo fallo idéntico cambia el nodo del texto, para que se vuelva a anunciar', async () => {
    m.resolverAlerta.mockRejectedValue(new Error('red'));
    render(<Bloque conFila />);
    await pulsar();
    const primero = estadoFila().firstElementChild;
    expect(primero?.textContent).toBe('No se ha podido marcar como resuelta.');

    await pulsar();
    const segundo = estadoFila().firstElementChild;
    expect(segundo?.textContent).toBe('No se ha podido marcar como resuelta.');
    expect(segundo).not.toBe(primero);
  });

  it('el status de la fila existe vacío antes de fallar y no es un alert', () => {
    render(<Bloque conFila />);
    expect(estadoFila().textContent).toBe('');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('ResolverAlerta: mientras se envía (T-015, R4)', () => {
  beforeEach(() => m.resolverAlerta.mockReset());

  it('aria-disabled y no disabled: conserva el foco y un segundo clic no envía otra vez', async () => {
    const d = diferido<{ ok: true }>();
    m.resolverAlerta.mockReturnValue(d.promesa);
    render(<Bloque conFila />);

    const boton = screen.getByRole('button', { name: NOMBRE_BOTON });
    boton.focus();
    await pulsar();

    const pendiente = screen.getByRole('button', { name: 'Guardando…' });
    expect(pendiente.getAttribute('aria-disabled')).toBe('true');
    expect(pendiente.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(pendiente);

    await act(async () => {
      fireEvent.click(pendiente);
    });
    expect(m.resolverAlerta).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolver({ ok: true });
    });
  });

  it('gemela: sin envío pendiente el botón no lleva aria-disabled', () => {
    render(<Bloque conFila />);
    expect(screen.getByRole('button', { name: NOMBRE_BOTON }).getAttribute('aria-disabled')).not.toBe('true');
  });
});

describe('ResolverAlerta: éxito (T-015, R4)', () => {
  beforeEach(() => m.resolverAlerta.mockReset());

  it('la fila desaparece al repintar: el foco va al grupo del bloque y el status del bloque lo anuncia', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    const { rerender } = render(<Bloque conFila />);
    screen.getByRole('button', { name: NOMBRE_BOTON }).focus();
    await pulsar();

    // El servidor revalida y la fila deja de existir.
    rerender(<Bloque conFila={false} />);

    const grupo = screen.getByRole('group', { name: 'Documentación pendiente' });
    expect(grupo.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(grupo);
    expect(estadoBloque().textContent).toBe('Marcada como resuelta.');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('gemela: si la fila no se va, el foco no se roba hasta que hay éxito', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: false, error: 'fallo' });
    render(<Bloque conFila />);
    const boton = screen.getByRole('button', { name: NOMBRE_BOTON });
    boton.focus();
    await pulsar();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: NOMBRE_BOTON }));
    expect(estadoBloque().textContent).toBe('');
  });
});
