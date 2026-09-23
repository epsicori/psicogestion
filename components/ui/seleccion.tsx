import type { ComponentProps } from 'react';

import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = ComponentProps<'select'> & {
  etiqueta: string;
  /** Errores de validación devueltos por la Server Action. */
  errores?: string[];
  opciones: { valor: string; texto: string }[];
  /** Texto de la opción vacía. Por defecto, «Sin indicar». */
  textoVacio?: string;
};

/**
 * `<select>` nativo, calcado del contrato de `Field` para que `register()` de react-hook-form
 * ya sepa usarlo. No es `components/ui/desplegable.tsx`: ese es un listbox propio con API
 * `valor`/`alElegir`, incompatible con `register()`, y unos pocos campos opcionales no
 * justifican reescribir el formulario alrededor de él.
 */
export function Seleccion({
  id,
  etiqueta,
  errores,
  opciones,
  textoVacio = t('comunes.sinIndicar'),
  className,
  ...props
}: Props) {
  const idError = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <select
        id={id}
        aria-invalid={errores ? true : undefined}
        aria-describedby={errores ? idError : undefined}
        className={cn(
          // min-h-11 (44 px), como Button, Casilla y Desplegable: ADR-044.
          'border-input bg-background min-h-11 rounded-lg border px-3 text-sm',
          'focus-visible:border-ring focus-visible:ring-ring/40 outline-none focus-visible:ring-2',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          className,
        )}
        {...props}
      >
        {/* La opción vacía es lo que hace que «opcional» sea verdad. Lleva texto: sin él,
            algunos lectores de pantalla la anuncian como «en blanco» y nada más. */}
        <option value="">{textoVacio}</option>
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
      {errores && (
        <p id={idError} className="text-destructive text-sm">
          {errores[0]}
        </p>
      )}
    </div>
  );
}
