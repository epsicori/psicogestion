import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';

/**
 * Marca de carga para el calendario semanal.
 * Insinúa una rejilla de 7 columnas con franjas de distintas alturas.
 */
export function EsqueletoCalendario(): ReactNode {
  return (
    <div
      role="status"
      aria-label={t('agenda.esqueletos.calendario')}
      className="grid grid-cols-7 gap-2"
    >
      {Array.from({ length: 7 }).map((_, dia) => (
        <div key={dia} className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, cita) => (
            <div
              key={cita}
              className="h-8 w-full animate-pulse rounded bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      ))}
      <span className="sr-only">{t('agenda.esqueletos.calendario')}</span>
    </div>
  );
}

/**
 * Marca de carga para una lista de elementos.
 * @param filas - Número de franjas a mostrar (por defecto 3).
 */
export function EsqueletoLista({ filas = 3 }: { filas?: number }): ReactNode {
  return (
    <div
      role="status"
      aria-label={t('agenda.esqueletos.lista')}
      className="flex flex-col gap-3"
    >
      {Array.from({ length: filas }).map((_, i) => (
        <div
          key={i}
          className="h-4 w-full animate-pulse rounded bg-muted motion-reduce:animate-none"
        />
      ))}
      <span className="sr-only">{t('agenda.esqueletos.lista')}</span>
    </div>
  );
}

/**
 * Marca de carga para el cuadro de métricas.
 * Insinúa varios bloques cuadrados u horizontales.
 */
export function EsqueletoCuadro(): ReactNode {
  return (
    <div
      role="status"
      aria-label={t('agenda.esqueletos.cuadro')}
      className="flex gap-4"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-16 flex-1 animate-pulse rounded bg-muted motion-reduce:animate-none"
        />
      ))}
      <span className="sr-only">{t('agenda.esqueletos.cuadro')}</span>
    </div>
  );
}
