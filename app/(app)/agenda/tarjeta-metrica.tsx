import type { ReactNode } from 'react';

/**
 * Tarjeta de métrica para el cuadro inferior de la agenda.
 * @param etiqueta - Etiqueta descriptiva de la métrica
 * @param valor - Valor ya formateado como cadena (ej: '82 %' o '—')
 * @param detalle - Detalle opcional debajo del valor
 */
export function TarjetaMetrica({
  etiqueta,
  valor,
  detalle,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
}): ReactNode {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="font-serif text-2xl font-medium text-foreground">{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground/70">{detalle}</p>}
    </div>
  );
}
