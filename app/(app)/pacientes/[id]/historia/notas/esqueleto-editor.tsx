import { Cargando } from '@/components/ui/piezas';

export function EsqueletoEditor() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-6 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <Cargando filas={6} />
      <div className="h-11 rounded bg-muted" />
    </div>
  );
}
