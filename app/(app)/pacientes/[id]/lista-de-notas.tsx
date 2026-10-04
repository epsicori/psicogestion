import { NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { PildoraDeEstado } from './historia/notas/estado-de-nota';
import { EstadoVacio } from '@/components/ui/piezas';
import { t, tCon } from '@/lib/i18n';
import type { NotaParaCopia } from '@/lib/exportaciones/servidor';
import type { EstadoNota } from '@/lib/notas/estado';

export type NotaDeLista = {
  id: string;
  fechaSesion: string;
  estado: EstadoNota;
  versiones: number;
  autor: string;
  conjunta: boolean;
  href: string;
};

// T-040 · P2-a: `paraCopia` son las notas de otros profesionales que la administración solo
// puede pedir por motivo; van en una lista aparte, sin estado ni contenido.
export function ListaDeNotas({
  notas,
  paraCopia = null,
}: {
  notas: NotaDeLista[];
  paraCopia?: NotaParaCopia[] | null;
}) {
  const otras = paraCopia ?? [];
  if (notas.length === 0 && otras.length === 0) {
    return (
      <EstadoVacio
        icono={<NotebookPen aria-hidden="true" className="size-5" />}
        frase={t('notas.lista.vacia')}
        explicacion={t('notas.lista.vaciaExplicacion')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {notas.length > 0 && (
        <ul className="divide-y divide-border">
          {notas.map((nota) => (
            <li key={nota.id}>
              <Link href={nota.href} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-medium">{nota.fechaSesion}</span>
                <PildoraDeEstado estado={nota.estado} />
                {nota.versiones > 1 && (
                  <span className="text-sm text-muted-foreground">
                    {tCon('notas.lista.versiones', { n: nota.versiones })}
                  </span>
                )}
                <span className="text-sm">{nota.autor}</span>
                {nota.conjunta && (
                  <span className="text-sm text-muted-foreground">
                    {t('notas.version.conjunta')}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {otras.length > 0 && (
        <section aria-labelledby="notas-para-copia">
          <h3 id="notas-para-copia" className="text-sm font-semibold">
            {t('exportaciones.lista.otras')}
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {otras.map((nota) => (
              <li key={nota.id}>
                <Link href={nota.href} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-medium">{nota.fechaSesion}</span>
                  <span className="text-sm text-muted-foreground">
                    {nota.versiones === 1
                      ? tCon('exportaciones.motivo.versiones.una', { n: 1 })
                      : tCon('exportaciones.motivo.versiones.varias', { n: nota.versiones })}
                  </span>
                  <span className="text-sm">{nota.autor}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
