import { Suspense } from 'react';

import { Cargando, Tarjeta } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';

import { ContenidoAlta } from './contenido-alta';

type ParametrosDeBusqueda = Promise<Record<string, string | string[] | undefined>>;

/**
 * El alta de cita como página (entrada directa, recarga o enlace). Desde la agenda se abre como
 * diálogo por la ruta interceptada de `@modal`. No es `async`: lo que espera la petición va
 * detrás de un `<Suspense>`.
 */
export default function PaginaAltaDeCita({ searchParams }: { searchParams: ParametrosDeBusqueda }) {
  return (
    <>
      <div className="mb-7">
        <h2 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">{t('agenda.alta.titulo')}</h2>
      </div>
      <Tarjeta className="max-w-3xl p-4 md:p-6">
        <Suspense fallback={<Cargando filas={5} />}>
          <ContenidoAlta searchParams={searchParams} modo="pagina" />
        </Suspense>
      </Tarjeta>
    </>
  );
}
