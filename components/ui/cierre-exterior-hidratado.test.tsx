import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCierreExterior } from './foco';

// H26 (T-028 B ronda 4): Next hidrata sobre `document`, asi que el delegado de React y el
// oyente de `useCierreExterior` cuelgan del mismo nodo y `stopPropagation` no basta.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Arbol({ alCerrar }: { alCerrar: () => void }) {
  useCierreExterior({ current: null }, true, alCerrar);
  return (
    <html>
      <body>
        <div
          role="dialog"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && e.defaultPrevented) e.nativeEvent.stopPropagation();
          }}
        >
          <button
            type="button"
            data-hueco
            onKeyDown={(e) => {
              if (e.key === 'Escape') e.preventDefault();
            }}
          >
            hueco
          </button>
        </div>
      </body>
    </html>
  );
}

describe('useCierreExterior ante un Escape ya atendido (H26)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('ignora un Escape con defaultPrevented aunque llegue al mismo nodo que el delegado de React', async () => {
    const alCerrar = vi.fn();
    const html = renderToString(<Arbol alCerrar={alCerrar} />);
    document.documentElement.innerHTML = html.replace(/^<html[^>]*>/, '').replace(/<\/html>$/, '');
    let raiz: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      raiz = hydrateRoot(document, <Arbol alCerrar={alCerrar} />);
    });
    const hueco = document.querySelector('[data-hueco]') as HTMLElement;
    hueco.focus();

    await act(async () => {
      hueco.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(alCerrar).not.toHaveBeenCalled();
    await act(async () => raiz?.unmount());
  });

  it('un Escape sin atender sigue cerrando', () => {
    const alCerrar = vi.fn();
    renderHook(() => useCierreExterior({ current: null }, true, alCerrar));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });
});
