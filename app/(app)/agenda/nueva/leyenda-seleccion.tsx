import { t } from '@/lib/i18n';

/** Cada estado de un hueco: su clave de texto y cómo se dibuja la muestra (nunca solo color). */
const ESTADOS = [
  { clave: 'agenda.alta.leyenda.libre', muestra: 'border-border border bg-transparent' },
  { clave: 'agenda.alta.leyenda.ocupado', muestra: 'bg-muted' },
  { clave: 'agenda.alta.leyenda.sugerida', muestra: 'border-border border border-dashed bg-transparent' },
  { clave: 'agenda.alta.leyenda.habitual', muestra: 'border-l-primary border-l-[3px] bg-transparent' },
  { clave: 'agenda.alta.leyenda.elegida', muestra: 'bg-secondary' },
] as const;

export function LeyendaSeleccion() {
  return (
    <ul aria-label={t('agenda.alta.leyenda.titulo')} className="flex flex-wrap gap-4">
      {ESTADOS.map(({ clave, muestra }) => (
        <li key={clave} className="flex items-center gap-2">
          <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded ${muestra}`} />
          <span className="text-foreground text-sm">{t(clave)}</span>
        </li>
      ))}
    </ul>
  );
}
