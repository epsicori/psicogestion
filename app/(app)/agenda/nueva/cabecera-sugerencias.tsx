import { t } from '@/lib/i18n';

export function CabeceraSugerencias({ modo }: { modo: 'habitual' | 'enFrio' }) {
  if (modo === 'enFrio') {
    return (
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t('agenda.alta.sugerencias.enFrio')}</h3>
        <p className="text-sm text-muted-foreground">{t('agenda.alta.sugerencias.enFrioAyuda')}</p>
      </div>
    );
  }

  return <h3 className="text-lg font-semibold text-foreground">{t('agenda.alta.sugerencias.titulo')}</h3>;
}
