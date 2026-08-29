'use client';

import { useEffect, useId, useRef, type ComponentProps } from 'react';

import { cn } from '@/lib/utils';

type Props = Omit<ComponentProps<'input'>, 'type' | 'children'> & {
  etiqueta: string;
  /** Ni marcada ni sin marcar: el estado de «algunas de las de abajo» en una lista. */
  indeterminada?: boolean;
};

export function Casilla({ etiqueta, indeterminada = false, className, id, ...props }: Props) {
  const generado = useId();
  const idCasilla = id ?? generado;
  const entrada = useRef<HTMLInputElement>(null);

  // `indeterminate` no existe como atributo de HTML: solo se puede poner por propiedad,
  // así que va aquí y no en el JSX.
  useEffect(() => {
    if (entrada.current) entrada.current.indeterminate = indeterminada;
  }, [indeterminada]);

  return (
    // El objetivo táctil de 44 px es la ETIQUETA entera, no el cuadradito: pedirle a un
    // pulgar que acierte 16 px es lo que el ADR-044 prohíbe.
    <label
      htmlFor={idCasilla}
      className={cn(
        'inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-sm',
        'text-foreground select-none',
        props.disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        ref={entrada}
        id={idCasilla}
        type="checkbox"
        className={cn(
          'size-5 shrink-0 rounded border-border accent-primary',
          'focus-visible:ring-ring/50 outline-none focus-visible:ring-2',
        )}
        {...props}
      />
      {etiqueta}
    </label>
  );
}
