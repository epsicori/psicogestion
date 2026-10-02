import { History } from 'lucide-react';
import { tCon } from '@/lib/i18n';

export function ModificadaPor({ fecha, autor }: { fecha: string; autor: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <History className="size-4" aria-hidden="true" />
      {tCon('notas.modificadaPor', { fecha, autor })}
    </p>
  );
}
