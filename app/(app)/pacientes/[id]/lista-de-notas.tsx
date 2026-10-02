import { NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { PildoraDeEstado } from './historia/notas/estado-de-nota';
import { EstadoVacio } from '@/components/ui/piezas';
import { t, tCon } from '@/lib/i18n';
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

export function ListaDeNotas({ notas }: { notas: NotaDeLista[] }) {
  if (notas.length === 0) {
    return (
      <EstadoVacio
        icono={<NotebookPen aria-hidden="true" className="size-5" />}
        frase={t('notas.lista.vacia')}
        explicacion={t('notas.lista.vaciaExplicacion')}
      />
    );
  }

  return (
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
  );
}
