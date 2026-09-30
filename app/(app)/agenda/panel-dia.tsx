'use client';

import { PanelAnclado } from '@/components/ui/panel-anclado';
import { t } from '@/lib/i18n';

import { ContenidoCita } from './contenido-cita';
import type { CitaVista, DiaVista } from './vista';

type Props = {
  dia: DiaVista;
  /** Las citas del día, en cualquier orden: aquí se ordenan. */
  citas: CitaVista[];
  ancla: HTMLElement;
  limites?: HTMLElement | null;
  alCerrar: () => void;
  pausado?: boolean;
  /** Con la cita encima en la pila: no se pinta (D9). */
  oculto?: boolean;
  /** Intro sobre una fila empuja el panel de la cita, con la fila como ancla (D9). */
  alAbrirCita: (cita: CitaVista, ancla: HTMLElement) => void;
};

/** El día entero en una lista: cada fila dice lo mismo que la cita de la rejilla, y nada más. */
export function PanelDia({ dia, citas, ancla, limites, alCerrar, pausado, oculto, alAbrirCita }: Props) {
  const ordenadas = [...citas].sort((a, b) => a.minutoPared - b.minutoPared || a.tramo - b.tramo);

  return (
    <PanelAnclado
      ancla={ancla}
      limites={limites}
      titulo={dia.etiquetaLarga}
      alCerrar={alCerrar}
      pausado={pausado}
      oculto={oculto}
    >
      {ordenadas.length === 0 ? (
        <p className="text-foreground text-sm">{t('agenda.panelDia.sinCitas')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {ordenadas.map((cita) => (
            <li key={`${cita.id}-${cita.tramo}`}>
              <button
                type="button"
                data-cita-id={cita.id}
                onClick={(evento) => alAbrirCita(cita, evento.currentTarget)}
                className="hover:bg-muted focus-visible:ring-ring/50 min-h-11 w-full rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2"
              >
                <ContenidoCita cita={cita} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </PanelAnclado>
  );
}
