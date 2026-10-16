import type { NivelDensidad } from '@/lib/agenda/anio';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// Los nombres de clase van literales para que Tailwind los vea al escanear el fichero.
/** El tono de fondo de cada nivel de densidad (0 = sin tono). */
export const FONDO = ['', 'bg-densidad-1', 'bg-densidad-2', 'bg-densidad-3', 'bg-densidad-4'] as const;

/** El ancho de la barra proporcional de cada nivel: el color solo no basta (WCAG 1.4.1). */
export const ANCHO = ['w-0', 'w-1/4', 'w-1/2', 'w-3/4', 'w-full'] as const;

/**
 * La leyenda de la escala de densidad: una muestra por escalón con su rango numérico. Sin
 * entradas (año sin citas) no pinta nada.
 */
export function LeyendaDensidad({ entradas }: { entradas: { nivel: NivelDensidad; texto: string }[] }) {
  if (entradas.length === 0) return null;

  return (
    <div>
      <p className="text-muted-foreground mb-1 text-xs">{t('agenda.anio.leyenda.titulo')}</p>
      <ul className="flex flex-wrap gap-3">
        {entradas.map((entrada) => (
          <li key={entrada.nivel} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden="true"
              className={cn(
                'border-border flex size-6 flex-col items-center justify-end rounded-md border pb-1',
                FONDO[entrada.nivel],
              )}
            >
              <span
                className={cn(
                  'bg-primary h-[3px] rounded-full forced-color-adjust-none forced-colors:bg-[CanvasText]',
                  ANCHO[entrada.nivel],
                )}
              />
            </span>
            <span>{entrada.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
