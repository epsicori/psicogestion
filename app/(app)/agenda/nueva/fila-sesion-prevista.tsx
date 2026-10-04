import { Pildora } from '@/components/ui/piezas';
import { t, tCon } from '@/lib/i18n';

type Estado = 'normal' | 'festivo' | 'ausencia' | 'ocupada' | 'cambioDeHora';

/** Etiqueta de cada bloqueo. Un bloqueo no enseña hora: la sesión no se va a dar a esa hora. */
const ETIQUETA_BLOQUEO = {
  festivo: 'agenda.alta.serie.festivo',
  ausencia: 'agenda.alta.serie.ausencia',
  ocupada: 'agenda.alta.serie.ocupada',
} as const;

/**
 * Lo que dice una sesión prevista de la serie. Solo formatea lo que llega ya escrito: ni fechas
 * ni horas se calculan aquí (ADR-034).
 */
export function CuerpoSesionPrevista({
  fecha,
  hora,
  estado,
  alternativa,
  horaResultante,
}: {
  fecha: string;
  hora: string | null;
  estado: Estado;
  alternativa: string | null;
  horaResultante: string | null;
}) {
  const bloqueo = estado === 'festivo' || estado === 'ausencia' || estado === 'ocupada' ? estado : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-foreground text-sm font-medium">{fecha}</span>

      {!bloqueo && hora && <span className="text-foreground font-mono text-sm">{hora}</span>}

      {bloqueo && (
        <>
          <Pildora tono="warning">{t(ETIQUETA_BLOQUEO[bloqueo])}</Pildora>
          <span className="text-muted-foreground text-sm">
            {alternativa !== null
              ? tCon('agenda.alta.serie.alternativa', { cuando: alternativa })
              : t('agenda.alta.serie.sinAlternativa')}
          </span>
        </>
      )}

      {estado === 'cambioDeHora' && (
        <Pildora tono="info">{tCon('agenda.alta.serie.cambioDeHora', { hora: horaResultante ?? '' })}</Pildora>
      )}
    </div>
  );
}
