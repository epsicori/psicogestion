'use client';

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { colocarPanel, type Rect } from './colocacion';
import { enfocables, useCierreExterior, useFocoAtrapado } from './foco';

type Props = {
  /** El elemento al que apunta el pico. El llamante lo guarda en estado al abrir. */
  ancla: HTMLElement;
  /** El calendario: el panel no se sale de él en horizontal. Sin él, la ventana. */
  limites?: HTMLElement | null;
  titulo: string;
  alCerrar: () => void;
  /**
   * Con un diálogo modal encima (reprogramar), el panel de debajo no atrapa el
   * foco ni se cierra con Escape o con un clic, que son del diálogo.
   */
  pausado?: boolean;
  /**
   * Con otro panel encima en la pila (D9): no se ve (`hidden`), el lector y el teclado no lo
   * alcanzan (`inert`) y no se cierra. Sigue montado para que su fila, el ancla del panel de
   * encima, exista cuando vuelva a la cima y reciba el foco.
   */
  oculto?: boolean;
  children: ReactNode;
};

function rectDe(elemento: HTMLElement): Rect {
  const { top, left, width, height } = elemento.getBoundingClientRect();
  return { top, left, width, height };
}

/**
 * Panel NO modal anclado a una celda o a una cita (T-014 §1.5): lo de detrás
 * sigue visible y el panel apunta a su origen. Atrapa el foco mientras está
 * abierto, pero NO lo devuelve al cerrar: lo hace el llamante, porque vuelve
 * al escalón anterior (de la cita al día, del día al número) y no siempre al
 * elemento que lo abrió (D9).
 */
export function PanelAnclado({ ancla, limites, titulo, alCerrar, pausado = false, oculto = false, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const activo = !pausado && !oculto;

  useFocoAtrapado(panel, activo);
  useCierreExterior(panel, activo, alCerrar);

  // La posición se escribe en el nodo y no en estado: se recalcula en cada
  // scroll, y pasar por React sería un render por evento y un fotograma con
  // el panel en su sitio anterior.
  useLayoutEffect(() => {
    const nodo = panel.current;
    // Oculto no tiene caja que medir: se coloca al volver a la cima.
    if (!nodo || oculto) return;

    const colocar = () => {
      const ventana = { width: window.innerWidth, height: window.innerHeight };
      let izquierda = 0;
      let derecha = ventana.width;
      if (limites) {
        const caja = limites.getBoundingClientRect();
        izquierda = Math.max(0, caja.left);
        derecha = Math.min(ventana.width, caja.left + caja.width);
      }
      const medida = nodo.getBoundingClientRect();
      const c = colocarPanel({
        ancla: rectDe(ancla),
        panel: { width: medida.width, height: nodo.scrollHeight || medida.height },
        limites: { top: 0, left: izquierda, width: derecha - izquierda, height: ventana.height },
      });
      nodo.style.top = `${c.top}px`;
      nodo.style.left = `${c.left}px`;
      nodo.style.setProperty('--pico-x', `${c.picoX}px`);
      nodo.style.setProperty('--alto-max', `${c.altoMax}px`);
      nodo.dataset.lado = c.lado;
      nodo.style.visibility = 'visible';
    };

    colocar();
    window.addEventListener('resize', colocar);
    // En captura: el scroll del contenedor del calendario no burbujea hasta `window`.
    window.addEventListener('scroll', colocar, true);
    return () => {
      window.removeEventListener('resize', colocar);
      window.removeEventListener('scroll', colocar, true);
    };
  }, [ancla, limites, oculto]);

  // El foco entra al abrir, al primer enfocable: un contenedor enfocado no dice
  // al lector de pantalla qué se puede hacer.
  useEffect(() => {
    const nodo = panel.current;
    if (!nodo) return;
    (enfocables(nodo)[0] ?? nodo).focus();
  }, []);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-labelledby={idTitulo}
      tabIndex={-1}
      hidden={oculto}
      inert={oculto}
      style={{ visibility: 'hidden' }}
      className={cn(
        'fixed z-40 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border',
        'bg-secondary text-secondary-foreground shadow-lg outline-none',
        // El pico: un cuadrado girado con el borde en los dos lados que asoman.
        'before:absolute before:left-[calc(var(--pico-x)-0.375rem)] before:size-3 before:rotate-45',
        'before:border-border before:bg-secondary',
        'data-[lado=abajo]:before:-top-1.5 data-[lado=abajo]:before:border-t data-[lado=abajo]:before:border-l',
        'data-[lado=arriba]:before:-bottom-1.5 data-[lado=arriba]:before:border-r data-[lado=arriba]:before:border-b',
      )}
    >
      <div className="relative max-h-[var(--alto-max)] overflow-y-auto p-4">
        <h2 id={idTitulo} className="font-serif text-base">
          {titulo}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
