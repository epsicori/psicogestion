'use client';

import { useEffect, useRef, useState } from 'react';

import { useFocoRodante } from '@/components/ui/rejilla-foco';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { ContenidoCita } from './contenido-cita';
import { HuecoSeleccion } from './nueva/hueco-seleccion';
import type { SeleccionHuecos } from './nueva/seleccion-huecos';
import { alTeclearHueco, enfocarPrimerHueco } from './nueva/teclado-huecos';
import type { CitaVista, DiaVista } from './vista';

type Props = {
  dias: DiaVista[];
  /** Sin ellas (modo selección) la lista no pinta citas. */
  citas?: CitaVista[];
  diaInicial: number;
  alAbrirCita?: (cita: CitaVista, ancla: HTMLElement) => void;
  /** Modo selección (alta de cita): los huecos del día elegido en lugar de sus citas. */
  seleccion?: SeleccionHuecos;
};

/** Cabecera de hora: `HH:00` de un minuto de pared, con enteros. */
function cabeceraDeHora(minuto: number): string {
  return `${String(Math.floor(minuto / 60)).padStart(2, '0')}:00`;
}

/**
 * La semana a 360 px (T-014 §1.6.3): siete botones para elegir el día y, debajo, sus citas por
 * hora. No hay rejilla que desplazar en horizontal (WCAG 1.4.10) ni arrastre: el camino para
 * mover una cita es el botón «Reprogramar» de su panel. Nada late aquí; el latido es de la
 * rejilla de la semana, que es la que se ve a partir de `md`.
 */
export function ListaDia({ dias, citas = [], diaInicial, alAbrirCita, seleccion }: Props) {
  const [elegido, setElegido] = useState(diaInicial);
  const { activo, setActivo, alTeclear, refDe } = useFocoRodante(dias.length, diaInicial, 7);
  const botonesDia = useRef<(HTMLButtonElement | null)[]>([]);
  const seccionHuecos = useRef<HTMLElement | null>(null);
  // Flecha abajo en un día que aún no es el visible: se cambia de día y, ya pintado, se entra en sus huecos.
  const entrarEnHuecos = useRef(false);

  useEffect(() => {
    if (!entrarEnHuecos.current) return;
    entrarEnHuecos.current = false;
    enfocarPrimerHueco(seccionHuecos.current);
  }, [elegido]);

  const delDia = citas
    .filter((c) => c.diaIndice === elegido)
    .sort((a, b) => a.minutoPared - b.minutoPared || a.tramo - b.tramo);

  const grupos: { hora: string; citas: CitaVista[] }[] = [];
  for (const cita of delDia) {
    const hora = cabeceraDeHora(cita.minutoPared);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.hora === hora) ultimo.citas.push(cita);
    else grupos.push({ hora, citas: [cita] });
  }

  const huecosDelDia = (seleccion?.huecos ?? [])
    .filter((h) => h.diaIndice === elegido)
    .sort((a, b) => a.minutoPared - b.minutoPared);
  const gruposDeHuecos: { hora: string; huecos: typeof huecosDelDia }[] = [];
  for (const hueco of huecosDelDia) {
    const hora = cabeceraDeHora(hueco.minutoPared);
    const ultimo = gruposDeHuecos[gruposDeHuecos.length - 1];
    if (ultimo && ultimo.hora === hora) ultimo.huecos.push(hueco);
    else gruposDeHuecos.push({ hora, huecos: [hueco] });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Siete en fila a 360 px no llegan a 44 px de ancho: dos filas hasta sm (evidencia, FALLA 2). */}
      <div
        role="group"
        aria-label={t('agenda.rejilla.diasDeLaSemana')}
        className="grid grid-cols-4 gap-1 sm:grid-cols-7"
      >
        {dias.map((dia, i) => (
          <button
            key={dia.fecha}
            type="button"
            data-dia={dia.fecha}
            ref={(el) => {
              botonesDia.current[i] = el;
              refDe(i)(el);
            }}
            tabIndex={i === activo ? 0 : -1}
            aria-label={dia.etiquetaLarga}
            aria-pressed={i === elegido}
            aria-current={dia.esHoy ? 'date' : undefined}
            onKeyDown={(evento) => {
              // En selección, Flecha abajo entra en los huecos del día (la única parada de Tab es el día).
              if (seleccion && evento.key === 'ArrowDown') {
                evento.preventDefault();
                if (i === elegido) enfocarPrimerHueco(seccionHuecos.current);
                else {
                  entrarEnHuecos.current = true;
                  setElegido(i);
                }
                return;
              }
              alTeclear(evento);
            }}
            onFocus={() => setActivo(i)}
            onClick={() => setElegido(i)}
            className={cn(
              'focus-visible:ring-ring/50 flex min-h-11 flex-col items-center justify-center rounded-lg border text-xs outline-none focus-visible:ring-2',
              i === elegido
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-muted',
              dia.esHoy && i !== elegido && 'text-primary font-semibold',
            )}
          >
            <span>{dia.etiquetaCorta}</span>
            <span className="font-mono text-sm">{dia.numero}</span>
          </button>
        ))}
      </div>

      {seleccion ? (
        <section ref={seccionHuecos} aria-label={t('agenda.alta.seleccion.huecosDelDia')} className="flex flex-col gap-3">
          {gruposDeHuecos.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('agenda.alta.seleccion.vacio')}</p>
          ) : (
            gruposDeHuecos.map((grupo) => (
              <div key={grupo.hora} className="flex flex-col gap-1">
                <h3 className="text-muted-foreground font-mono text-xs">{grupo.hora}</h3>
                <ul className="flex flex-col gap-1">
                  {grupo.huecos.map((hueco) => (
                    <li key={hueco.clave}>
                      <HuecoSeleccion
                        hueco={hueco}
                        elegido={hueco.clave === seleccion.elegido}
                        alElegir={seleccion.alElegir}
                        alTeclear={(evento) =>
                          alTeclearHueco(evento, { contenedor: seccionHuecos.current, dia: botonesDia.current[elegido] ?? null })
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      ) : (
      <section aria-label={t('agenda.rejilla.citasDelDia')} className="flex flex-col gap-3">
        {grupos.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('agenda.rejilla.sinCitas')}</p>
        ) : (
          grupos.map((grupo) => (
            <div key={grupo.hora} className="flex flex-col gap-1">
              <h3 className="text-muted-foreground font-mono text-xs">{grupo.hora}</h3>
              <ul className="flex flex-col gap-1">
                {grupo.citas.map((cita) => (
                  <li key={`${cita.id}-${cita.tramo}`}>
                    <button
                      type="button"
                      data-cita-id={cita.id}
                      onClick={(evento) => alAbrirCita?.(cita, evento.currentTarget)}
                      className="bg-card border-border hover:bg-muted focus-visible:ring-ring/50 min-h-11 w-full rounded-lg border px-2 py-1.5 outline-none focus-visible:ring-2"
                    >
                      <ContenidoCita cita={cita} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
      )}
    </div>
  );
}
