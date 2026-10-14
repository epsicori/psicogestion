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

/**
 * Marca de carga para la vista anual: doce meses con su título y las cinco semanas de días.
 * Las clases `contenedor-anio` y `meses-anio` son las mismas que la vista, para que el esqueleto
 * ocupe el sitio que ocupará el año (T-047).
 */
export function EsqueletoAnio(): ReactNode {
  return (
    <div role="status" aria-label={t('agenda.esqueletos.anio')} className="contenedor-anio">
      <div className="meses-anio">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i}>
            <div className="bg-muted mb-2 h-4 w-24 animate-pulse rounded motion-reduce:animate-none" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, j) => (
                <div
                  key={j}
                  className="bg-muted aspect-square animate-pulse rounded motion-reduce:animate-none"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">{t('agenda.esqueletos.anio')}</span>
    </div>
  );
}
