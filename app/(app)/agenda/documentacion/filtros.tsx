import Link from 'next/link';

import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { hrefDocumentacion, ORDEN_TIPOS, type Filtros as FiltrosVigentes } from '../pendientes';

const OPCION =
  'focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm outline-none hover:bg-muted focus-visible:ring-2';

type Tipo = (typeof ORDEN_TIPOS)[number];

function Grupo({
  id,
  etiqueta,
  opciones,
}: {
  id: string;
  etiqueta: string;
  opciones: { texto: string; href: string; vigente: boolean }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={id} className="text-muted-foreground text-sm font-medium">
        {etiqueta}
      </span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {opciones.map((o) => (
          <Link
            key={o.texto}
            href={o.href}
            aria-current={o.vigente ? 'true' : undefined}
            className={cn(OPCION, o.vigente && 'border-foreground bg-muted font-semibold')}
          >
            {o.texto}
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Los filtros de la página, como enlaces: cambiar uno vuelve a la página 1 (sin `pagina`) y
 * conserva el otro. El de tipo solo si el rol ve más de uno; el de nivel solo si ve notas, que
 * son lo único que escala. No hay filtro de profesional.
 */
export function Filtros({ visibles, vigentes }: { visibles: readonly Tipo[]; vigentes: FiltrosVigentes }) {
  const base = { tipo: vigentes.tipo, nivel: vigentes.nivel };
  const conTipo = (tipo: Tipo | null) => hrefDocumentacion({ ...base, tipo });
  const conNivel = (nivel: 1 | 2 | 3 | null) => hrefDocumentacion({ ...base, nivel });

  const verTipo = visibles.length > 1;
  const verNivel = visibles.includes('nota_sin_firmar');
  if (!verTipo && !verNivel) return null;

  return (
    <div className="flex flex-col gap-2">
      {verTipo && (
        <Grupo
          id="documentacion-filtro-tipo"
          etiqueta={t('agenda.documentacion.filtros.tipo')}
          opciones={[
            { texto: t('agenda.documentacion.filtros.todos'), href: conTipo(null), vigente: vigentes.tipo === null },
            ...ORDEN_TIPOS.filter((tipo) => visibles.includes(tipo)).map((tipo) => ({
              texto: t(`agenda.documentacion.tipos.${tipo}`),
              href: conTipo(tipo),
              vigente: vigentes.tipo === tipo,
            })),
          ]}
        />
      )}
      {verNivel && (
        <Grupo
          id="documentacion-filtro-nivel"
          etiqueta={t('agenda.documentacion.filtros.nivel')}
          opciones={[
            { texto: t('agenda.documentacion.filtros.todos'), href: conNivel(null), vigente: vigentes.nivel === null },
            { texto: t('agenda.documentacion.filtros.nivel1'), href: conNivel(1), vigente: vigentes.nivel === 1 },
            { texto: t('agenda.documentacion.filtros.nivel2'), href: conNivel(2), vigente: vigentes.nivel === 2 },
            { texto: t('agenda.documentacion.filtros.nivel3'), href: conNivel(3), vigente: vigentes.nivel === 3 },
          ]}
        />
      )}
    </div>
  );
}
