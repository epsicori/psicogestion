import { ShieldAlert } from 'lucide-react';
import { t } from '@/lib/i18n';

export function AvisoReservadas() {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-muted p-3 text-sm">
      <ShieldAlert aria-hidden="true" className="size-5 shrink-0 text-foreground" />
      <div>
        <p className="font-medium">{t('notas.reservadas.titulo')}</p>
        <ul className="mt-1 list-disc pl-5">
          <li>{t('notas.reservadas.excluye')}</li>
          <li>{t('notas.reservadas.noOculta')}</li>
          <li>{t('notas.reservadas.noOpone')}</li>
        </ul>
      </div>
    </div>
  );
}
