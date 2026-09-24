import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Estados visibles de una cita. Los cinco primeros salen del enum `estado_cita`; «en curso»
 * no está en la base: se calcula en servidor con `esta_en_curso()` y llega ya resuelto
 * (ADR-045).
 */
export type EstadoVisibleCita =
  | 'programada'
  | 'confirmada'
  | 'en_curso'
  | 'realizada'
  | 'cancelada'
  | 'no_asistida';

/** El orden de la leyenda: el de la tabla de estados de T-014. */
const ORDEN_ESTADOS: EstadoVisibleCita[] = [
  'programada',
  'confirmada',
  'en_curso',
  'realizada',
  'cancelada',
  'no_asistida',
];

/**
 * Forma y color de cada punto. Las formas se distinguen sin color (ADR-047): hueco fino,
 * hueco reforzado, relleno con halo, relleno, tachado y partido.
 */
const CLASES_PUNTO: Record<EstadoVisibleCita, string> = {
  programada: 'border border-muted-foreground bg-transparent',
  confirmada: 'border-2 border-muted-foreground bg-transparent',
  en_curso: 'bg-primary',
  realizada: 'bg-primary',
  cancelada: 'relative border border-destructive bg-transparent',
  no_asistida:
    'border border-accent bg-[linear-gradient(90deg,var(--accent)_50%,transparent_50%)]',
};

/**
 * El punto, decorativo. `late` decide si el halo de «en curso» pulsa o se queda quieto:
 * solo la cita en curso de verdad late, nunca su muestra en la leyenda (un único elemento
 * animado por pantalla).
 */
function Punto({ estado, late }: { estado: EstadoVisibleCita; late: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-forma={estado}
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        CLASES_PUNTO[estado],
        estado === 'en_curso' && (late ? 'latido-estado' : 'halo-estado'),
      )}
    >
      {estado === 'cancelada' && (
        <span className="absolute inset-x-[-1px] top-1/2 h-px -rotate-45 bg-destructive" />
      )}
    </span>
  );
}

/**
 * Punto de estado de la cita con su etiqueta. Con `conEtiqueta={false}` la etiqueta deja de
 * verse pero sigue para el lector de pantalla: el estado nunca queda solo en color ni solo
 * en forma. La etiqueta va siempre en `text-foreground`: el ámbar sobre papel no llega a AA.
 */
export function PuntoEstadoCita({
  estado,
  conEtiqueta = true,
}: {
  estado: EstadoVisibleCita;
  conEtiqueta?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Punto estado={estado} late />
      <span className={cn('text-foreground', !conEtiqueta && 'sr-only')}>
        {t(`agenda.estados.${estado}`)}
      </span>
    </span>
  );
}

/** Leyenda lateral de los seis estados, en el orden de la tabla. Ninguno late. */
export function LeyendaEstadosCita() {
  return (
    <ul aria-label={t('agenda.leyendaEstados')} className="flex flex-col gap-1.5 text-sm">
      {ORDEN_ESTADOS.map((estado) => (
        <li key={estado} className="flex items-center gap-2">
          <Punto estado={estado} late={false} />
          <span className="text-foreground">{t(`agenda.estados.${estado}`)}</span>
        </li>
      ))}
    </ul>
  );
}
