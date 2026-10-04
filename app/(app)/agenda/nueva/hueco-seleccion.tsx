import type { CSSProperties } from 'react';

import { t, tCon } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import type { HuecoVista } from './vista-alta';

type Props = {
  hueco: HuecoVista;
  elegido: boolean;
  alElegir: (clave: string, etiqueta: string) => void;
  /** Colocación (rejilla) o ancho (lista). */
  className?: string;
  style?: CSSProperties;
};

/**
 * Un hueco del calendario del alta (T-028 D11): libre = botón con su etiqueta completa y
 * `aria-pressed`; ocupado = texto que no se enfoca y que nunca dice qué lo ocupa. Cada estado se
 * ve además del color: sugerida = borde discontinuo y texto; habitual = barra de 3 px y texto
 * (D7); elegida = fondo secundario y texto.
 */
export function HuecoSeleccion({ hueco, elegido, alElegir, className, style }: Props) {
  if (hueco.estado === 'ocupado') {
    return (
      <div className={cn('bg-muted text-muted-foreground min-h-11 overflow-hidden rounded-lg p-2 text-sm', className)} style={style}>
        <span className="font-mono">{hueco.rango}</span>
        <span className="sr-only">, {t('agenda.alta.seleccion.etiquetaOcupado')}</span>
        <span aria-hidden="true" className="block text-xs">
          {t('agenda.alta.seleccion.etiquetaOcupado')}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-hueco={hueco.clave}
      aria-pressed={elegido}
      aria-label={elegido ? `${hueco.etiqueta}, ${t('agenda.alta.seleccion.elegida')}` : hueco.etiqueta}
      onClick={() => alElegir(hueco.clave, hueco.etiqueta)}
      className={cn(
        'border-border focus-visible:ring-ring/50 min-h-11 w-full overflow-hidden rounded-lg border p-2 text-left text-sm outline-none focus-visible:ring-2',
        hueco.sugerida !== null && 'border-dashed',
        hueco.habitual && 'border-l-primary border-l-[3px]',
        elegido ? 'bg-secondary' : 'bg-card hover:bg-muted',
        className,
      )}
      style={style}
    >
      <span className="font-mono">{hueco.rango}</span>
      {hueco.sugerida !== null && (
        <span aria-hidden="true" className="text-muted-foreground block text-xs">
          {tCon('agenda.alta.seleccion.etiquetaSugerida', { n: hueco.sugerida })}
        </span>
      )}
      {hueco.habitual && (
        <span aria-hidden="true" className="text-muted-foreground block text-xs">
          {t('agenda.alta.seleccion.etiquetaHabitual')}
        </span>
      )}
      {elegido && (
        <span aria-hidden="true" className="block text-xs font-medium">
          {t('agenda.alta.seleccion.etiquetaElegida')}
        </span>
      )}
    </button>
  );
}
