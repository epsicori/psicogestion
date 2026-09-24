import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

type Props = ComponentProps<'textarea'> & {
  etiqueta: string;
  /** Errores de validación devueltos por la Server Action. */
  errores?: string[];
};

/**
 * Área de texto de formulario: calcada del contrato de `Field` (`components/ui/field.tsx`)
 * porque es el que `register()` de react-hook-form ya sabe usar. Existe para los campos
 * largos (alergias, medicación) que un `<input>` de una línea no puede pintar bien.
 */
export function AreaTexto({ id, etiqueta, errores, className, ...props }: Props) {
  const idError = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <textarea
        id={id}
        aria-invalid={errores ? true : undefined}
        aria-describedby={errores ? idError : undefined}
        className={cn(
          'border-input bg-background min-h-20 rounded-lg border px-3 py-2 text-sm',
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
