'use client';

import { createContext, useContext, useRef, useState, type ComponentProps, type ReactNode } from 'react';

import { FilaPropuesta } from './fila-propuesta';

const AlResuelta = createContext<((anuncio: string) => void) | null>(null);

/**
 * Lo que sobrevive a «Por confirmar» (revisión TS H9). Al resolver una propuesta, el recargado
 * se lleva su fila, y el bloque entero si era la última: el anuncio vive aquí, en una región
 * siempre montada, y el foco viene aquí en vez de caer a `body` con el botón que desaparece.
 */
export function ZonaPorConfirmar({ children }: { children: ReactNode }) {
  const [anuncio, setAnuncio] = useState('');
  const zona = useRef<HTMLDivElement>(null);

  function alResuelta(texto: string) {
    // Dos anuncios iguales seguidos no cambian el DOM y el lector no vuelve a hablar (revisión
    // de cierre N5): el repetido lleva un espacio duro al final.
    setAnuncio((previo) => (previo === texto ? `${texto} ` : texto));
    // El foco solo viene a la zona si estaba en ella o en `body` (su botón acaba de desmontarse).
    // En cualquier otro control, un panel, un diálogo o un selector, es de ese control: la
    // resolución llegó tarde (revisiones B-1 y B2-2).
    const activo = document.activeElement;
    if (activo && activo !== document.body && !zona.current?.contains(activo)) return;
    zona.current?.focus();
  }

  return (
    <div ref={zona} tabIndex={-1} className="flex flex-col outline-none">
      <AlResuelta value={alResuelta}>{children}</AlResuelta>
      <div role="status" className="sr-only">
        {anuncio}
      </div>
    </div>
  );
}

/** Una fila de «Por confirmar»: la de siempre, que al resolverse avisa a su zona. */
export function FilaPorConfirmar(props: Omit<ComponentProps<typeof FilaPropuesta>, 'alResuelta'>) {
  const alResuelta = useContext(AlResuelta);
  return <FilaPropuesta {...props} alResuelta={alResuelta ?? undefined} />;
}
