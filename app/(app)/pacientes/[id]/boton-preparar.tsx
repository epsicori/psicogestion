'use client';

import { useState, useTransition } from 'react';

import { t, tCon } from '@/lib/i18n';

import { prepararBorradorEnProveedor, type ErrorDePreparacion } from './acciones-facturacion';

type Props = {
  borradorId: string;
  /** Nombre del programa de facturación conectado, ya resuelto en servidor. */
  programa: string;
};

/**
 * Encola un borrador para el programa de facturación y enseña por qué no se pudo. El mensaje es
 * siempre un texto fijo por código: ni cifras ni texto de la base (ADR-053, ADR-077).
 * Usa `aria-disabled` y no `disabled`: un botón con foco que se deshabilita lo suelta a BODY
 * (patrón T-028 H27), y así tampoco se encola dos veces mientras la petición sigue en curso.
 */
export function BotonPreparar({ borradorId, programa }: Props) {
  const [error, setError] = useState<ErrorDePreparacion | null>(null);
  const [enviando, iniciar] = useTransition();

  function preparar() {
    if (enviando) return;
    setError(null);
    iniciar(async () => {
      const resultado = await prepararBorradorEnProveedor(borradorId);
      if ('error' in resultado) setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={preparar}
        aria-disabled={enviando || undefined}
        aria-busy={enviando || undefined}
        className="border-border hover:bg-muted focus-visible:ring-ring/50 rounded-lg border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 aria-disabled:opacity-50"
      >
        {tCon('facturacion.panel.preparar', { programa })}
      </button>
      <p role="alert" className="text-destructive text-xs">
        {error ? t(`facturacion.panel.errores.${error}`) : null}
      </p>
    </div>
  );
}
