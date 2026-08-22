import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

type Props = ComponentProps<'input'> & {
  etiqueta: string;
  /** Errores de validación devueltos por la Server Action. */
  errores?: string[];
};

/**
 * Campo de formulario: etiqueta, control y error, atados por id para que el lector
 * de pantalla anuncie el fallo junto al campo que lo provoca.
 */
export function Field({ id, etiqueta, errores, className, ...props }: Props) {
  const idError = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={errores ? true : undefined}
        aria-describedby={errores ? idError : undefined}
        className={cn(
          'border-input bg-background h-10 rounded-lg border px-3 text-sm',
          'placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-ring/40 outline-none focus-visible:ring-2',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          className,
        )}
        {...props}
      />
      {errores && (
        <p id={idError} className="text-destructive text-sm">
          {errores[0]}
        </p>
      )}
    </div>
  );
}
