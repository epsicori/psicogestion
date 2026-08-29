'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { cn } from '@/lib/utils';
import { indiceSiguiente, useCierreExterior, useDevolucionDeFoco } from './foco';

export type OpcionDesplegable = {
  valor: string;
  etiqueta: string;
};

type Props = {
  opciones: OpcionDesplegable[];
  valor: string | null;
  alElegir: (valor: string) => void;
  etiqueta: string;
  marcador?: string;
};

/**
 * Desplegable de selección escrito a mano (ADR-040). No es un `<select>` nativo porque el
 * vocabulario de la maqueta necesita marcado propio; a cambio, el teclado y el ARIA los
 * ponemos nosotros y por eso van probados.
 */
export function Desplegable({
  opciones,
  valor,
  alElegir,
  etiqueta,
  marcador = 'Selecciona…',
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const seleccionada = Math.max(
    0,
    opciones.findIndex((o) => o.valor === valor),
  );
  const [enfocada, setEnfocada] = useState(seleccionada);
  const contenedor = useRef<HTMLDivElement>(null);
  const listbox = useRef<HTMLDivElement>(null);
  const idListbox = useId();
  const idEtiqueta = useId();

  useDevolucionDeFoco(abierto);
  useCierreExterior(contenedor, abierto, () => setAbierto(false));

  useEffect(() => {
    if (!abierto) return;
    listbox.current?.querySelectorAll<HTMLElement>('[role="option"]')[enfocada]?.focus();
  }, [abierto, enfocada]);

  const abrirEn = (indice: number) => {
    setEnfocada(indice);
    setAbierto(true);
  };

  const alTeclearDisparador = (evento: KeyboardEvent<HTMLButtonElement>) => {
    if (evento.key === 'ArrowDown' || evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      abrirEn(seleccionada);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      abrirEn(opciones.length - 1);
    }
  };

  const alTeclearLista = (evento: KeyboardEvent<HTMLDivElement>) => {
    const siguiente = indiceSiguiente(evento.key, enfocada, opciones.length, 'vertical');
    if (siguiente !== null) {
      evento.preventDefault();
      setEnfocada(siguiente);
      return;
    }
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      alElegir(opciones[enfocada].valor);
      setAbierto(false);
    } else if (evento.key === 'Tab') {
      evento.preventDefault();
      setAbierto(false);
    }
  };

  const elegida = opciones.find((o) => o.valor === valor);

  return (
    <div ref={contenedor} className="relative">
      <span id={idEtiqueta} className="mb-1 block text-xs text-muted-foreground">
        {etiqueta}
      </span>

      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idListbox : undefined}
        aria-labelledby={idEtiqueta}
        onClick={() => (abierto ? setAbierto(false) : abrirEn(seleccionada))}
        onKeyDown={alTeclearDisparador}
        className={cn(
          'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border',
          'bg-background px-3 text-left text-sm text-foreground',
          'transition-colors motion-reduce:transition-none',
          'hover:bg-muted focus-visible:ring-ring/50 outline-none focus-visible:ring-2',
        )}
      >
        <span className={cn(!elegida && 'text-muted-foreground')}>
          {elegida?.etiqueta ?? marcador}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <div
          ref={listbox}
          id={idListbox}
          role="listbox"
          aria-labelledby={idEtiqueta}
          onKeyDown={alTeclearLista}
          className={cn(
            'absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border',
            'bg-card p-1 text-card-foreground shadow-lg',
          )}
        >
          {opciones.map((opcion, indice) => (
            <button
              key={opcion.valor}
              type="button"
              role="option"
              aria-selected={opcion.valor === valor}
              tabIndex={indice === enfocada ? 0 : -1}
              onClick={() => {
                alElegir(opcion.valor);
                setAbierto(false);
              }}
              className={cn(
                'flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm',
                'transition-colors motion-reduce:transition-none',
                'focus-visible:ring-ring/50 outline-none focus-visible:ring-2',
                // El malva es selección, no un estado (interfaz.md).
                opcion.valor === valor
                  ? 'bg-secondary text-secondary-foreground'
                  : 'hover:bg-muted',
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
