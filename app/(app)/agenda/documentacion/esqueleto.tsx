import { t } from '@/lib/i18n';

/**
 * La marca de carga de la página: tres barras quietas. Sin `animate-*` (D1): no reutiliza
 * `EsqueletoLista` de la agenda, que late.
 */
export function EsqueletoDocumentacion() {
  return (
    <div role="status" className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="h-10 w-full rounded bg-muted" />
      ))}
      <p className="sr-only">{t('agenda.documentacion.pagina.cargando')}</p>
    </div>
  );
}
