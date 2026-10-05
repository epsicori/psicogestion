import type { ReactNode } from 'react';

import { EstadoVacio } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';

const FRANJA = 'bg-muted animate-pulse rounded motion-reduce:animate-none';

function Esqueleto({ franjas, contenedor, franja }: { franjas: number; contenedor: string; franja: string }) {
  return (
    <div role="status" aria-label={t('agenda.alta.cargando')}>
      <div className={contenedor}>
        {Array.from({ length: franjas }).map((_, i) => (
          <div key={i} className={`${franja} ${FRANJA}`} />
        ))}
      </div>
      <span className="sr-only">{t('agenda.alta.cargando')}</span>
    </div>
  );
}

export function EsqueletoSugerencias(): ReactNode {
  return <Esqueleto franjas={3} contenedor="flex gap-3" franja="h-16 w-24" />;
}

export function EsqueletoSeleccion(): ReactNode {
  return <Esqueleto franjas={10} contenedor="grid grid-cols-5 gap-2" franja="h-8" />;
}

export function EsqueletoSerie(): ReactNode {
  return <Esqueleto franjas={4} contenedor="flex flex-col gap-3" franja="h-4 w-full" />;
}

export function ErrorPieza({ mensaje }: { mensaje: string }): ReactNode {
  return (
    <div role="alert">
      <EstadoVacio frase={mensaje} />
    </div>
  );
}
