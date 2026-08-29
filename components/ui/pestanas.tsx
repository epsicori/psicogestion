'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { indiceSiguiente } from './foco';

export type Pestana = {
  id: string;
  etiqueta: string;
};

type Props = {
  pestanas: Pestana[];
  activa: string;
  alCambiar: (id: string) => void;
  /** Etiqueta del grupo para el lector de pantalla: «Historia clínica», «Ficha»… */
  etiqueta: string;
  /**
   * Prefijo compartido con `PanelDePestana`. Lo genera quien las usa con `useId()` y lo
   * pasa a las dos: es lo que cruza `aria-controls` con `aria-labelledby`. Si lo generara
   * `Pestanas` por dentro, el panel no tendría forma de saberlo.
   */
  prefijo: string;
};

/**
 * Solo la barra de pestañas. El panel lo pinta quien la usa: separar las dos cosas es lo
 * que permite que una ficha cargue el panel activo en servidor sin traerse los demás.
 */
export function Pestanas({ pestanas, activa, alCambiar, etiqueta, prefijo }: Props) {
  const barra = useRef<HTMLDivElement>(null);

  const idPestana = (id: string) => `${prefijo}-pestana-${id}`;

  const alTeclear = (evento: KeyboardEvent<HTMLDivElement>) => {
    const actual = pestanas.findIndex((p) => p.id === activa);
    const siguiente = indiceSiguiente(evento.key, actual, pestanas.length, 'horizontal');
    if (siguiente === null) return;

    evento.preventDefault();
    alCambiar(pestanas[siguiente].id);

    // Se busca por posición dentro del tablist y no por `id`: escapar un identificador
    // generado por `useId()` para meterlo en un selector CSS es un rodeo con trampas
    // —los `:` de React— y aquí el orden del DOM ya es el orden de las pestañas.
    const botones = barra.current?.querySelectorAll<HTMLElement>('[role="tab"]');
    botones?.[siguiente]?.focus();
  };

  return (
    <div
      ref={barra}
      role="tablist"
      aria-label={etiqueta}
      onKeyDown={alTeclear}
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {pestanas.map((pestana) => {
        const seleccionada = pestana.id === activa;
        return (
          <button
            key={pestana.id}
            id={idPestana(pestana.id)}
            type="button"
            role="tab"
            aria-selected={seleccionada}
            aria-controls={`${prefijo}-panel-${pestana.id}`}
            // Tabulación móvil: solo la seleccionada entra en el orden de tabulación, y
            // dentro del grupo se anda con las flechas. Es lo que espera un lector de
            // pantalla de un `tablist`.
            tabIndex={seleccionada ? 0 : -1}
            onClick={() => alCambiar(pestana.id)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 text-sm whitespace-nowrap',
              'transition-colors motion-reduce:transition-none',
              'focus-visible:ring-ring/50 outline-none focus-visible:ring-2',
              seleccionada
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {pestana.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/** El panel que corresponde a una pestaña. Se usa junto a `Pestanas`, con el mismo `id`. */
export function PanelDePestana({
  children,
  id,
  prefijo,
}: {
  children: ReactNode;
  id: string;
  prefijo: string;
}) {
  return (
    <div
      id={`${prefijo}-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`${prefijo}-pestana-${id}`}
      tabIndex={0}
      className="focus-visible:ring-ring/50 pt-4 outline-none focus-visible:ring-2"
    >
      {children}
    </div>
  );
}
