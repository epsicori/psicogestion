'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { indiceSiguiente, useCierreExterior, useDevolucionDeFoco } from './foco';

export type OpcionDeMenu = {
  id: string;
  etiqueta: string;
  alElegir: () => void;
  destructiva?: boolean;
};

type Props = {
  /** Lo que se pulsa para abrir. Texto corto: es un botón, no una frase. */
  disparador: ReactNode;
  opciones: OpcionDeMenu[];
  /** Para el lector de pantalla, cuando el disparador es solo un icono. */
  etiqueta?: string;
};

export function Menu({ disparador, opciones, etiqueta }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [enfocada, setEnfocada] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  useDevolucionDeFoco(abierto);
  useCierreExterior(contenedor, abierto, () => setAbierto(false));

  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[enfocada]?.focus();
  }, [abierto, enfocada]);

  const alTeclearDisparador = (evento: KeyboardEvent<HTMLButtonElement>) => {
    if (evento.key === 'ArrowDown' || evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      setEnfocada(0);
      setAbierto(true);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setEnfocada(opciones.length - 1);
      setAbierto(true);
    }
  };

  const alTeclearLista = (evento: KeyboardEvent<HTMLDivElement>) => {
    const siguiente = indiceSiguiente(evento.key, enfocada, opciones.length, 'vertical');
    if (siguiente !== null) {
      evento.preventDefault();
      setEnfocada(siguiente);
      return;
    }
    if (evento.key === 'Tab') {
      // Un menú no se tabula: se cierra y el foco vuelve al disparador. Tabular dentro
      // dejaría al usuario dentro de una capa que ya no ve.
      evento.preventDefault();
      setAbierto(false);
    }
  };

  return (
    <div ref={contenedor} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        aria-label={etiqueta}
        onClick={() => {
          setEnfocada(0);
          setAbierto((previo) => !previo);
        }}
        onKeyDown={alTeclearDisparador}
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
          ref={lista}
          id={idMenu}
          role="menu"
          aria-label={etiqueta}
          onKeyDown={alTeclearLista}
          className={cn(
            'absolute right-0 z-40 mt-1 min-w-48 rounded-lg border border-border bg-card p-1',
            'text-card-foreground shadow-lg',
          )}
        >
          {opciones.map((opcion, indice) => (
            <button
              key={opcion.id}
              type="button"
              role="menuitem"
              // Tabulación móvil: solo la opción enfocada es alcanzable, y dentro se anda
              // con las flechas.
              tabIndex={indice === enfocada ? 0 : -1}
              onClick={() => {
                setAbierto(false);
                opcion.alElegir();
              }}
              className={cn(
                'flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm',
                'transition-colors motion-reduce:transition-none',
                'focus-visible:ring-ring/50 outline-none focus-visible:ring-2',
                opcion.destructiva
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-card-foreground hover:bg-muted',
              )}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
