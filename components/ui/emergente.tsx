'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { enfocables, useCierreExterior, useDevolucionDeFoco, useFocoAtrapado } from './foco';

type Props = {
  disparador: ReactNode;
  titulo: string;
  children: ReactNode;
  etiqueta?: string;
};

/**
 * Emergente contextual: un panel anclado al disparador, con su pico. A diferencia del
 * diálogo NO es modal —no tapa la página ni pone velo—, pero sí atrapa el foco mientras
 * está abierto: si no, tabular lo deja detrás de una capa que sigue viéndose.
 */
export function Emergente({ disparador, titulo, children, etiqueta }: Props) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const idPanel = useId();
  const idTitulo = useId();

  useDevolucionDeFoco(abierto);
  useFocoAtrapado(panel, abierto);
  useCierreExterior(contenedor, abierto, () => setAbierto(false));

  useEffect(() => {
    if (!abierto) return;
    const nodo = panel.current;
    if (!nodo) return;
    (enfocables(nodo)[0] ?? nodo).focus();
  }, [abierto]);

  return (
    <div ref={contenedor} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        aria-label={etiqueta}
        onClick={() => setAbierto((previo) => !previo)}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm',
          'bg-background text-foreground transition-colors motion-reduce:transition-none',
          'hover:bg-muted focus-visible:ring-ring/50 outline-none focus-visible:ring-2',
        )}
      >
        {disparador}
      </button>

      {abierto && (
        <div
          ref={panel}
          id={idPanel}
          role="dialog"
          aria-labelledby={idTitulo}
          tabIndex={-1}
          className={cn(
            // A 360 px un ancho fijo se sale de la pantalla: se limita al ancho de la
            // ventana y se deja que el contenido decida (ADR-044).
            'absolute left-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))]',
            'rounded-xl border border-border bg-secondary p-4 shadow-lg outline-none',
            'text-secondary-foreground',
          )}
        >
          <h3 id={idTitulo} className="font-serif text-sm">
            {titulo}
          </h3>
          <div className="mt-2 text-sm">{children}</div>
        </div>
      )}
    </div>
  );
}
