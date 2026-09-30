'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { PuntoEstadoCita } from '@/components/ui/estado-cita';
import { PanelAnclado } from '@/components/ui/panel-anclado';
import { t, tCon } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { FilaPropuesta } from './fila-propuesta';
import type { CitaVista } from './vista';

type Props = {
  cita: CitaVista;
  ancla: HTMLElement;
  limites?: HTMLElement | null;
  alCerrar: () => void;
  pausado?: boolean;
  alReprogramar: () => void;
  /** La propuesta se confirmó o se descartó: quien abrió el panel lo cierra y anuncia. */
  alPropuestaResuelta?: (anuncio: string) => void;
};

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <span className="text-foreground text-xs">{etiqueta}</span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}

function lugarDe(cita: CitaVista): string | null {
  if (cita.centroNombre !== null && cita.sala !== null) {
    return tCon('agenda.cita.centroYSala', { centro: cita.centroNombre, sala: cita.sala });
  }
  if (cita.centroNombre !== null) return cita.centroNombre;
  if (cita.sala !== null) return tCon('agenda.cita.sala', { sala: cita.sala });
  return null;
}

function notaPendiente(dias: number): string {
  if (dias === 0) return t('agenda.panelCita.notaPendiente.hoy');
  if (dias === 1) return t('agenda.panelCita.notaPendiente.una');
  return tCon('agenda.panelCita.notaPendiente.varias', { n: dias });
}

/**
 * La ficha de una cita, anclada a su botón (T-014 §1.6.3). El orden es el del diseño y lo que
 * no existe se omite, no se pinta vacío. El aviso de nota pendiente informa y no bloquea.
 */
export function PanelCita({ cita, ancla, limites, alCerrar, pausado, alReprogramar, alPropuestaResuelta }: Props) {
  const lugar = lugarDe(cita);
  const propuesta = cita.propuestaPendiente;

  return (
    <PanelAnclado ancla={ancla} limites={limites} titulo={cita.nombrePaciente} alCerrar={alCerrar} pausado={pausado}>
      <div className="flex flex-col gap-3">
        <p className="text-foreground text-sm">
          {tCon('agenda.cita.rangoYDuracion', { rango: cita.rango, duracion: cita.duracion })}
        </p>
        {cita.tipoNombre !== null && <Campo etiqueta={t('agenda.panelCita.tipo')}>{cita.tipoNombre}</Campo>}
        <Campo etiqueta={t('agenda.panelCita.profesional')}>{cita.profesionalNombre}</Campo>
        {lugar !== null && <Campo etiqueta={t('agenda.panelCita.lugar')}>{lugar}</Campo>}
        {cita.notaOperativa !== null && (
          <Campo etiqueta={t('agenda.panelCita.notaOperativa')}>{cita.notaOperativa}</Campo>
        )}
        <Campo etiqueta={t('agenda.panelCita.estado')}>
          <PuntoEstadoCita estado={cita.estado} late={false} />
        </Campo>
        {cita.deSerie && (
          <Campo etiqueta={t('agenda.panelCita.serie')}>
            {cita.desviada
              ? `${t('agenda.cita.desviada')}${cita.motivoDesviacion ? ` · ${cita.motivoDesviacion}` : ''}`
              : t('agenda.cita.deSerie')}
          </Campo>
        )}

        {propuesta && (
          <div className="border-border flex flex-col gap-1 border-t pt-3">
            <span className="text-foreground text-xs">{t('agenda.panelCita.propuesta')}</span>
            <FilaPropuesta
              id={propuesta.id}
              nombre={null}
              prevista=""
              motivo=""
              propuesta={
                propuesta.rango === null ? null : tCon('agenda.panelCita.propuestaRango', { rango: propuesta.rango })
              }
              alResuelta={alPropuestaResuelta}
            />
          </div>
        )}

        {cita.notas.diasPendiente !== null && (
          <p className="border-border text-foreground rounded-lg border p-2 text-sm">
            {notaPendiente(cita.notas.diasPendiente)}
          </p>
        )}

        {(cita.notas.mostrar || cita.reprogramable) && (
          <div className="flex flex-wrap gap-2">
            {cita.notas.mostrar && (
              <Link
                href={cita.notas.href}
                className={cn(
                  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold',
                  'focus-visible:ring-ring/50 outline-none focus-visible:ring-2',
                  cita.notas.primario
                    ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                    : 'border-border bg-background hover:bg-muted border',
                )}
              >
                {t('agenda.panelCita.notas')}
              </Link>
            )}
            {cita.reprogramable && (
              <Button variante="contorno" onClick={alReprogramar}>
                {t('agenda.panelCita.reprogramar')}
              </Button>
            )}
          </div>
        )}
      </div>
    </PanelAnclado>
  );
}
