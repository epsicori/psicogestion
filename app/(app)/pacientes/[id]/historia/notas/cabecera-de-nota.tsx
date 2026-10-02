import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { t, tCon } from '@/lib/i18n';

export function CabeceraDeNota({
  paciente,
  sesion,
  volverHref,
}: {
  paciente: string;
  sesion: string | null;
  volverHref: string;
}) {
  return (
    <header className="flex flex-col gap-2">
      <Link
        href={volverHref}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {t('notas.cabecera.volver')}
      </Link>
      <h1 className="font-serif text-2xl">{tCon('notas.cabecera.titulo', { paciente })}</h1>
      {sesion !== null && <p className="text-sm text-muted-foreground">{sesion}</p>}
    </header>
  );
}
