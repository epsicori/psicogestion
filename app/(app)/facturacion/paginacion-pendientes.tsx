'use client';

import Link from 'next/link';
import { useEffect, useRef, type MouseEvent } from 'react';

import { t } from '@/lib/i18n';

type Props = {
  pagina: number;
  /** El texto «Del 51 al 100 de 120», ya compuesto en servidor. */
  rango: string;
  anterior: string | null;
  siguiente: string | null;
};

const ENLACE_DE_PAGINA =
  'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Marca de módulo, no de componente: la navegación puede desmontarse y montarse al cambiar de
 * página (el bloque se vuelve a servir), y entonces un ref o un estado se perderían. Guarda la
 * PÁGINA a la que se pidió ir: el efecto de la página nueva la apaga y solo lleva el foco al rango
 * si la página que llega es la pedida (B-H6, R4.5). Un clic con modificador (nueva pestaña) no la
 * marca; una navegación sustituida, que llega a otra página, la apaga sin enfocar. Montar sin clic
 * previo (primera carga, atrás/adelante del navegador) no mueve el foco.
 */
let destino: number | null = null;

/** La navegación de «Pendiente de cobro»: tras pasar de página, el foco va al rango, no se pierde. */
export function PaginacionPendientes({ pagina, rango, anterior, siguiente }: Props) {
  const rangoRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (destino === null) return;
    const esperado = destino;
    destino = null;
    if (esperado === pagina) rangoRef.current?.focus();
  }, [pagina]);

  const alHacerClic = (paginaDestino: number) => (evento: MouseEvent) => {
    if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    destino = paginaDestino;
  };

  return (
    <nav
      aria-label={t('cobros.paginacion.nombre')}
      className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"
    >
      <p ref={rangoRef} tabIndex={-1} className="text-xs text-muted-foreground outline-none">
        {rango}
      </p>
      <div className="flex gap-2">
        {anterior !== null && (
          <Link href={anterior} onClick={alHacerClic(pagina - 1)} className={ENLACE_DE_PAGINA}>
            {t('cobros.paginacion.anteriores')}
          </Link>
        )}
        {siguiente !== null && (
          <Link href={siguiente} onClick={alHacerClic(pagina + 1)} className={ENLACE_DE_PAGINA}>
            {t('cobros.paginacion.siguientes')}
          </Link>
        )}
      </div>
    </nav>
  );
}
