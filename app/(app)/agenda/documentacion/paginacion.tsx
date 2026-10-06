import Link from 'next/link';

import { t, tCon } from '@/lib/i18n';

import { hrefDocumentacion, type Filtros } from '../pendientes';

const ENLACE =
  'focus-visible:ring-ring/50 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border px-3 text-sm outline-none hover:bg-muted focus-visible:ring-2';

/** Anterior, «Página X de Y» y Siguiente. Conserva tipo y nivel, nunca `paciente` (D11). */
export function Paginacion({
  pagina,
  ultima,
  filtros,
}: {
  pagina: number;
  ultima: number;
  filtros: Pick<Filtros, 'tipo' | 'nivel'>;
}) {
  if (ultima <= 1) return null;
  const a = (n: number) => hrefDocumentacion({ tipo: filtros.tipo, nivel: filtros.nivel, pagina: n });
  return (
    <nav aria-label={t('agenda.documentacion.paginacion.etiqueta')} className="flex flex-wrap items-center gap-2">
      {pagina > 1 && (
        <Link href={a(pagina - 1)} className={ENLACE}>
          {t('agenda.documentacion.paginacion.anterior')}
        </Link>
      )}
      <Link href={a(pagina)} aria-current="page" className={`${ENLACE} font-semibold`}>
        {tCon('agenda.documentacion.paginacion.actual', { x: pagina, y: ultima })}
      </Link>
      {pagina < ultima && (
        <Link href={a(pagina + 1)} className={ENLACE}>
          {t('agenda.documentacion.paginacion.siguiente')}
        </Link>
      )}
    </nav>
  );
}
