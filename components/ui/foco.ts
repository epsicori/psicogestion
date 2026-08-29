'use client';

import { useEffect, useRef, type RefObject } from 'react';

// Sin librería de componentes (ADR-040), el comportamiento de foco lo escribimos nosotros.
// Vive aquí y no dentro de cada primitiva porque escribirlo seis veces es garantizar que
// cinco salgan mal: es el mismo motivo por el que las primitivas son compartidas.

const SELECTOR_ENFOCABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Los elementos enfocables que hay AHORA dentro de `raiz`. Se consulta en cada pulsación
 * y no se guarda: si se cacheara al abrir, el contenido que aparece después —una lista que
 * termina de cargar— quedaría fuera de la trampa.
 */
export function enfocables(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE)).filter(
    (elemento) => elemento.offsetParent !== null || elemento === document.activeElement,
  );
}

/**
 * Devuelve el foco a donde estaba cuando esto se abrió. Sin esto, quien navega con teclado
 * pierde el punto de la página en cuanto cierra.
 */
export function useDevolucionDeFoco(activo: boolean) {
  const previo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!activo) return;

    previo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      previo.current?.focus();
      previo.current = null;
    };
  }, [activo]);
}

/** Tab y Shift+Tab circulan dentro de `ref` y no se escapan al fondo. */
export function useFocoAtrapado(ref: RefObject<HTMLElement | null>, activo: boolean) {
  useEffect(() => {
    if (!activo) return;

    const alPulsar = (evento: globalThis.KeyboardEvent) => {
      if (evento.key !== 'Tab') return;

      const contenedor = ref.current;
      if (!contenedor) return;

      const lista = enfocables(contenedor);
      if (lista.length === 0) {
        evento.preventDefault();
        return;
      }

      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      const enfocado = document.activeElement;

      // Si el foco ya se había escapado —o nunca entró— se trae de vuelta en vez de
      // dejarlo correr por el fondo.
      if (!(enfocado instanceof HTMLElement) || !contenedor.contains(enfocado)) {
        evento.preventDefault();
        primero.focus();
        return;
      }

      if (evento.shiftKey && enfocado === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && enfocado === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    };

    // En captura: así la trampa actúa aunque algo de dentro detenga la propagación.
    document.addEventListener('keydown', alPulsar, true);
    return () => document.removeEventListener('keydown', alPulsar, true);
  }, [ref, activo]);
}

/**
 * Escape y clic fuera. El Escape se escucha en `document` y no en el nodo: si se colgara
 * del propio panel, no cerraría cuando el foco está fuera de él —que es justo lo que pasa
 * con un emergente o un menú recién abierto—.
 */
export function useCierreExterior(
  ref: RefObject<HTMLElement | null>,
  activo: boolean,
  alCerrar: () => void,
) {
  useEffect(() => {
    if (!activo) return;

    const alTeclear = (evento: globalThis.KeyboardEvent) => {
      if (evento.key === 'Escape') alCerrar();
    };

    // `mousedown` y no `click`: cerrar al apretar es lo que espera quien usa el ratón, y
    // evita que el `click` posterior active lo que haya debajo.
    const alApretarFuera = (evento: globalThis.MouseEvent) => {
      const destino = evento.target;
      if (destino instanceof Node && ref.current && !ref.current.contains(destino)) alCerrar();
    };

    document.addEventListener('keydown', alTeclear);
    document.addEventListener('mousedown', alApretarFuera);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.removeEventListener('mousedown', alApretarFuera);
    };
  }, [ref, activo, alCerrar]);
}

/**
 * Tabulación móvil (roving tabindex) para menús y pestañas: un solo elemento del grupo es
 * tabulable, y las flechas mueven dentro. Devuelve el índice siguiente según la tecla, o
 * `null` si la tecla no es de navegación.
 */
export function indiceSiguiente(
  tecla: string,
  actual: number,
  total: number,
  orientacion: 'horizontal' | 'vertical',
): number | null {
  const anterior = orientacion === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  const siguiente = orientacion === 'vertical' ? 'ArrowDown' : 'ArrowRight';

  if (tecla === siguiente) return (actual + 1) % total;
  if (tecla === anterior) return (actual - 1 + total) % total;
  if (tecla === 'Home') return 0;
  if (tecla === 'End') return total - 1;
  return null;
}
