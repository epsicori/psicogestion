import { t, tCon } from '@/lib/i18n';

export function FilaDeVersion({
  numero,
  autor,
  firmadaEn,
  motivo,
  conjunta,
  sello,
  huellaCorta,
  vigente,
}: {
  numero: number;
  autor: string;
  firmadaEn: string;
  motivo: string | null;
  conjunta: boolean;
  sello: string;
  huellaCorta: string;
  vigente: boolean;
}) {
  return (
    <li className="flex flex-col gap-1 py-3">
      <p className="font-medium">
        {tCon('notas.version.titulo', { numero: String(numero) })}
        {vigente && (
          <span className="text-muted-foreground">
            {' '}({t('notas.version.vigente')})
          </span>
        )}
      </p>
      <p className="text-sm">
        {tCon('notas.version.firmadaPor', { fecha: firmadaEn, autor })}
      </p>
      {motivo !== null && (
        <p className="text-sm">
          {tCon('notas.version.motivo', { motivo })}
        </p>
      )}
      {conjunta && (
        <p className="text-sm text-muted-foreground">
          {t('notas.version.conjunta')}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{sello}</p>
      <p className="font-mono text-xs text-muted-foreground">
        {tCon('notas.version.huella', { huella: huellaCorta })}
      </p>
    </li>
  );
}
