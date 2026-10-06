import { Suspense } from 'react';

import { Tarjeta } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';

import { ContenidoDocumentacion } from './contenido';
import { EsqueletoDocumentacion } from './esqueleto';
import { ID_TITULO } from './parametros';

type ParametrosDeBusqueda = Promise<Record<string, string | string[] | undefined>>;

/**
 * Todos los pendientes de documentación que ve quien mira, agrupados por paciente (T-048).
 * **No es `async`**: la cabecera no depende de la petición y se prerenderiza; lo que espera
 * `searchParams` va detrás de un `<Suspense>`. El título es el destino del foco cuando se resuelve
 * el último pendiente de la lista.
 */
export default function PaginaDocumentacion({ searchParams }: { searchParams: ParametrosDeBusqueda }) {
  return (
    <>
      <div className="mb-7">
        <p className="text-primary mb-2 text-xs font-semibold tracking-[0.18em] uppercase">{t('agenda.versalita')}</p>
        <h2
          id={ID_TITULO}
          tabIndex={-1}
          className="focus-visible:ring-ring/50 font-serif text-3xl font-semibold tracking-tight outline-none focus-visible:ring-2 md:text-4xl"
        >
          {t('agenda.documentacion.titulo')}
        </h2>
      </div>
      <Tarjeta className="max-w-3xl p-4 md:p-6">
        <Suspense fallback={<EsqueletoDocumentacion />}>
          <ContenidoDocumentacion searchParams={searchParams} />
        </Suspense>
      </Tarjeta>
    </>
  );
}
