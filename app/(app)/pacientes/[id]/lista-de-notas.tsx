import { NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { PildoraDeEstado } from './historia/notas/estado-de-nota';
import { Button } from '@/components/ui/button';
import { AvisoDeError, EstadoVacio } from '@/components/ui/piezas';
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
// puede pedir por motivo; van en una lista aparte, sin estado ni contenido. `null` es una
// lectura fallida (a quien no administra, la base le devuelve una lista vacía, no un error):
// se avisa con un reintento y nunca se dice «no hay notas» (revisión B-H1).
export function ListaDeNotas({
  notas,
  paraCopia = [],
  alReintentarCopias,
}: {
  notas: NotaDeLista[];
  paraCopia?: NotaParaCopia[] | null;
  alReintentarCopias?: () => void;
}) {
  const otras = paraCopia ?? [];
  const copiasFallidas = paraCopia === null;
  if (notas.length === 0 && otras.length === 0 && !copiasFallidas) {
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
      {copiasFallidas && (
        <AvisoDeError
          mensaje={t('exportaciones.lista.noSePudoLeer')}
          accion={
            alReintentarCopias && (
              <Button variante="contorno" onClick={alReintentarCopias}>
                {t('notas.aviso.reintentar')}
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
