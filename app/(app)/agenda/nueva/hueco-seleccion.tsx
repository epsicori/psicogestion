import type { CSSProperties, KeyboardEvent } from 'react';

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
  alTeclear?: (evento: KeyboardEvent<HTMLElement>) => void;
  /** Hay otro hueco al lado (carriles): solo la hora de inicio, y el rango entero en `title`. */
  compacto?: boolean;
  /** Es parada de Tab: los huecos del día activo sí, los de los demás días no (H21). */
  parada?: boolean;
};

/**
 * Un hueco del calendario del alta (T-028 D11): libre = botón con su etiqueta completa y
 * `aria-pressed`; ocupado = texto que no se enfoca y que nunca dice qué lo ocupa. Cada estado se
 * ve además del color: sugerida = borde discontinuo y texto; habitual = barra de 3 px y texto
 * (D7); elegida = fondo secundario y texto. Parada de Tab solo en el día activo: ver `teclado-huecos.ts`.
 */
export function HuecoSeleccion({ hueco, elegido, alElegir, className, style, alTeclear, compacto = false, parada = true }: Props) {
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
      // Como las citas de la agenda: Tab recorre los huecos del día activo; las flechas, entre días y huecos (H10, H21).
      tabIndex={parada ? 0 : -1}
      onKeyDown={alTeclear}
      aria-pressed={elegido}
      aria-label={elegido ? `${hueco.etiqueta}, ${t('agenda.alta.seleccion.elegida')}` : hueco.etiqueta}
      title={compacto ? `${hueco.rango}` : undefined}
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
      <span className="font-mono">{compacto ? hueco.horaLocal : hueco.rango}</span>
      {/* «Elegida» en la linea de la hora (H25): un hueco de 30 minutos solo tiene una linea, y debajo se cortaba.
          Va antes que «Sugerida» y «Habitual»: si el hueco es bajo, lo que se corta es lo secundario. */}
      {elegido && (
        <span aria-hidden="true" className="ms-2 text-xs font-medium">
          {t('agenda.alta.seleccion.etiquetaElegida')}
        </span>
      )}
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
    </button>
  );
}
