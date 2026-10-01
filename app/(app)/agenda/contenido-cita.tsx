import { ArrowRightLeft, Hourglass, Repeat } from 'lucide-react';

import { PuntoEstadoCita } from '@/components/ui/estado-cita';
import { t, tCon } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import type { CitaVista } from './vista';

/**
 * Tailwind solo ve nombres de clase escritos enteros: por eso un array literal y no
 * `bg-profesional-${n}`. El color es decoración (el profesional va siempre escrito), y por
 * eso los `--profesional-N` no entran en la tabla de contraste.
 */
const FRANJAS = [
  'bg-profesional-1',
  'bg-profesional-2',
  'bg-profesional-3',
  'bg-profesional-4',
  'bg-profesional-5',
  'bg-profesional-6',
] as const;

export function claseFranja(color: CitaVista['colorProfesional']): string {
  return FRANJAS[color - 1];
}

/** La hora que se pinta: la del inicio de la cita, y las 00:00 en el tramo que sigue a la medianoche. */
export function horaDeCita(cita: CitaVista): string {
  return cita.tramo === 0 ? cita.horaLocal : '00:00';
}

/** `tipo · profesional`, sin tipo y sin separador si la cita no lo tiene. */
export function tipoYProfesional(cita: CitaVista): string {
  return cita.tipoNombre === null
    ? cita.profesionalNombre
    : tCon('agenda.cita.tipoYProfesional', { tipo: cita.tipoNombre, profesional: cita.profesionalNombre });
}

/**
 * Lo que dice una cita en la rejilla de la semana, en la lista del día y en el panel del día:
 * los mismos campos, en el mismo orden (T-014 §1.6.3). Es el contenido de un `<button>`, así
 * que solo lleva `span`. `late` es de la rejilla: en cualquier otro sitio, nunca late.
 */
export function ContenidoCita({ cita, late = false }: { cita: CitaVista; late?: boolean }) {
  return (
    <span className="flex min-w-0 items-stretch gap-2 text-left">
      <span aria-hidden="true" className={cn('w-1 shrink-0 self-stretch rounded-full', claseFranja(cita.colorProfesional))} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          <span className="font-mono">{horaDeCita(cita)}</span>
          <span className="truncate font-medium">{cita.nombreCorto}</span>
          {cita.deSerie && !cita.desviada && (
            <>
              <Repeat aria-hidden="true" className="size-3 shrink-0" />
              <span className="sr-only">{t('agenda.cita.deSerie')}</span>
            </>
          )}
          {cita.desviada && (
            <>
              <ArrowRightLeft aria-hidden="true" className="size-3 shrink-0" />
              <span className="sr-only">{t('agenda.cita.desviada')}</span>
            </>
          )}
          {cita.propuestaPendiente && (
            <>
              <Hourglass aria-hidden="true" className="size-3 shrink-0" />
              <span className="sr-only">{t('agenda.cita.propuesta')}</span>
            </>
          )}
        </span>
        <span className="text-foreground truncate text-xs">{tipoYProfesional(cita)}</span>
        <span className="text-xs">
          <PuntoEstadoCita estado={cita.estado} conEtiqueta={false} late={late && cita.late} />
        </span>
      </span>
    </span>
  );
}
