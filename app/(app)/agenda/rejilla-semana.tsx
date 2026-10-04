'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

import { useFocoRodante } from '@/components/ui/rejilla-foco';
import { t, tCon } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { PX_MIN, destinoDeArrastre, horaDeMinuto } from './arrastre';
import { ContenidoCita } from './contenido-cita';
import { HuecoSeleccion } from './hueco-seleccion';
import { carrilesDeHuecos, type SeleccionHuecos } from './seleccion-huecos';
import type { CitaVista, DiaVista, VistaCalendario } from './vista';

/** Lo que hay que mover el puntero antes de que un clic se convierta en arrastre. */
const UMBRAL_PX = 4;

/** Lo que mide un objetivo táctil (44 px, WCAG 2.5.8 reforzado). */
const OBJETIVO_TACTIL_PX = 44;

/**
 * El alto mínimo de una cita al tacto: 44 px, pero sin llegar a la siguiente cita que tiene debajo
 * en su misma franja horizontal. Crecer sobre ella la taparía y dejaría un objetivo útil de 24 px
 * con una caja que dice una duración que no tiene (revisión de cierre N3). Las de otra columna
 * del grupo no cuentan: no están debajo.
 */
export function altoTactil(cita: CitaVista, delDia: CitaVista[]): number {
  const finCita = cita.minutoPared + cita.duracionMinutos;
  const izquierda = cita.columna / cita.columnasEnGrupo;
  const derecha = (cita.columna + 1) / cita.columnasEnGrupo;
  let siguiente = Infinity;
  for (const otra of delDia) {
    if (otra === cita || otra.minutoPared < finCita) continue;
    const desde = otra.columna / otra.columnasEnGrupo;
    const hasta = (otra.columna + 1) / otra.columnasEnGrupo;
    if (desde < derecha && izquierda < hasta) siguiente = Math.min(siguiente, otra.minutoPared);
  }
  return Math.min(OBJETIVO_TACTIL_PX, (siguiente - cita.minutoPared) * PX_MIN);
}

type Props = {
  titulo: string;
  dias: DiaVista[];
  eje: VistaCalendario['eje'];
  /** Sin ellas (modo selección) la rejilla no pinta citas. */
  citas?: CitaVista[];
  /** El día por el que se entra con Tab: el de hoy, o el primero de la semana. */
  diaInicial: number;
  alAbrirDia?: (dia: DiaVista, ancla: HTMLElement) => void;
  alAbrirCita?: (cita: CitaVista, ancla: HTMLElement) => void;
  /** Se soltó una cita en otro sitio: día y hora locales que pide el diálogo. */
  alSoltar?: (cita: CitaVista, fecha: string, hora: string) => void;
  /**
   * Modo selección (alta de cita): en lugar de citas, los huecos del alta con la misma geometría
   * (`minutoPared`, `duracionMinutos`, `PX_MIN`). Sin arrastre ni panel de día.
   */
  seleccion?: SeleccionHuecos;
};

type Gesto = {
  cita: CitaVista;
  /** El botón de la cita: recibe el foco antes de pedir el diálogo, que lo devuelve ahí. */
  boton: HTMLButtonElement;
  x0: number;
  y0: number;
  yAgarre: number;
  moviendo: boolean;
  destino: { columna: number; minuto: number } | null;
};

function cuentaDeCitas(n: number): string {
  if (n === 0) return t('agenda.rejilla.sinCitas');
  return n === 1 ? t('agenda.rejilla.citas.una') : tCon('agenda.rejilla.citas.varias', { n });
}

function cuentaDeLibres(n: number): string {
  if (n === 0) return t('agenda.alta.seleccion.sinLibres');
  return n === 1 ? t('agenda.alta.seleccion.unLibre') : tCon('agenda.alta.seleccion.variosLibres', { n });
}

/**
 * La semana como rejilla (T-014 §1.6.3): una fila de siete celdas, y en cada una el número del
 * día (que es lo que recibe el foco, con tabulación móvil) y sus citas colocadas a su hora. El
 * arrastre es un atajo con el ratón; el botón «Reprogramar» del panel de la cita es el camino
 * sin arrastre. Ningún `Date` aquí: horas y días llegan ya escritos.
 */
export function RejillaSemana({ titulo, dias, eje, citas = [], diaInicial, alAbrirDia, alAbrirCita, alSoltar, seleccion }: Props) {
  const { activo, setActivo, alTeclear, refDe } = useFocoRodante(dias.length, diaInicial, 7);
  const botonesDia = useRef<(HTMLButtonElement | null)[]>([]);
  const fila = useRef<HTMLDivElement | null>(null);
  const primerCuerpo = useRef<HTMLDivElement | null>(null);

  const gesto = useRef<Gesto | null>(null);
  const huboArrastre = useRef(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [fantasma, setFantasma] = useState<{ columna: number; minuto: number; duracion: number } | null>(null);

  useEffect(() => {
    if (!arrastrando) return;

    function terminar() {
      gesto.current = null;
      setArrastrando(false);
      setFantasma(null);
    }

    function alMover(evento: globalThis.PointerEvent) {
      const g = gesto.current;
      const cuerpo = primerCuerpo.current;
      const filaEl = fila.current;
      if (!g || !cuerpo || !filaEl) return;
      if (!g.moviendo && Math.hypot(evento.clientX - g.x0, evento.clientY - g.y0) < UMBRAL_PX) return;
      g.moviendo = true;
      const caja = filaEl.getBoundingClientRect();
      g.destino = destinoDeArrastre({
        x: evento.clientX,
        y: evento.clientY,
        yAgarre: g.yAgarre,
        caja: { left: caja.left, top: cuerpo.getBoundingClientRect().top, width: caja.width },
        desdeMinuto: eje.desdeMinuto,
        hastaMinuto: eje.hastaMinuto,
        columnas: dias.length,
      });
      setFantasma({ ...g.destino, duracion: g.cita.duracionMinutos });
    }

    function alSoltarPuntero() {
      const g = gesto.current;
      if (g?.moviendo && g.destino) {
        // El clic que sigue a soltar el puntero no debe abrir el panel. Si nadie lo consume
        // (se soltó fuera del botón), se olvida en cuanto acaba el turno.
        huboArrastre.current = true;
        setTimeout(() => {
          huboArrastre.current = false;
        }, 0);
        const fecha = dias[g.destino.columna].fecha;
        const hora = horaDeMinuto(g.destino.minuto);
        if (fecha !== g.cita.fechaLocal || hora !== g.cita.horaLocal) {
          // Un pointerdown no enfoca el botón en todos los navegadores (revisión TS H10).
          g.boton.focus();
          alSoltar?.(g.cita, fecha, hora);
        }
      }
      terminar();
    }

    function alTeclearVentana(evento: globalThis.KeyboardEvent) {
      if (evento.key !== 'Escape') return;
      if (gesto.current?.moviendo) {
        huboArrastre.current = true;
        setTimeout(() => {
          huboArrastre.current = false;
        }, 0);
      }
      terminar();
    }

    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltarPuntero);
    window.addEventListener('pointercancel', terminar);
    window.addEventListener('keydown', alTeclearVentana);
    return () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltarPuntero);
      window.removeEventListener('pointercancel', terminar);
      window.removeEventListener('keydown', alTeclearVentana);
    };
  }, [arrastrando, dias, eje.desdeMinuto, eje.hastaMinuto, alSoltar]);

  function alPulsar(evento: PointerEvent<HTMLButtonElement>, cita: CitaVista) {
    if (!cita.reprogramable || cita.tramo !== 0) return;
    if (evento.pointerType === 'touch' || evento.button !== 0) return;
    const cuerpo = primerCuerpo.current;
    if (!cuerpo) return;
    huboArrastre.current = false;
    gesto.current = {
      cita,
      boton: evento.currentTarget,
      x0: evento.clientX,
      y0: evento.clientY,
      yAgarre: evento.clientY - (cuerpo.getBoundingClientRect().top + (cita.minutoPared - eje.desdeMinuto) * PX_MIN),
      moviendo: false,
      destino: null,
    };
    setArrastrando(true);
  }

  function alTeclearCita(evento: KeyboardEvent<HTMLButtonElement>, indiceDia: number) {
    if (evento.key !== 'Escape') return;
    setActivo(indiceDia);
    botonesDia.current[indiceDia]?.focus();
  }

  const alto = (eje.hastaMinuto - eje.desdeMinuto) * PX_MIN;
  const carriles = seleccion ? carrilesDeHuecos(seleccion.huecos) : null;

  return (
    <div className="flex">
      <div aria-hidden="true" className="w-12 shrink-0">
        <div className="h-11" />
        <div className="relative" style={{ height: alto }}>
          {eje.horas.map((hora, i) => (
            <span
              key={hora}
              className="text-muted-foreground absolute right-2 -translate-y-1/2 font-mono text-xs"
              style={{ top: i * 60 * PX_MIN }}
            >
              {hora}
            </span>
          ))}
        </div>
      </div>

      <div role="grid" aria-label={titulo} className="min-w-0 flex-1">
        <div role="row" ref={fila} className="grid grid-cols-7">
          {dias.map((dia, i) => {
            const delDia = citas.filter((c) => c.diaIndice === i);
            const huecosDelDia = seleccion?.huecos.filter((h) => h.diaIndice === i) ?? [];
            return (
              <div key={dia.fecha} role="gridcell" className="border-border min-w-0 border-l first:border-l-0">
                <button
                  type="button"
                  data-dia={dia.fecha}
                  ref={(el) => {
                    botonesDia.current[i] = el;
                    refDe(i)(el);
                  }}
                  tabIndex={i === activo ? 0 : -1}
                  aria-current={dia.esHoy ? 'date' : undefined}
                  onKeyDown={alTeclear}
                  onFocus={() => setActivo(i)}
                  onClick={(evento) => {
                    if (!seleccion) return alAbrirDia?.(dia, evento.currentTarget);
                    // En selección el día no abre panel: lleva al primer hueco libre que tiene.
                    const celda = evento.currentTarget.closest('[role="gridcell"]');
                    celda?.querySelector<HTMLButtonElement>('button[data-hueco]')?.focus();
                  }}
                  className={cn(
                    'hover:bg-muted focus-visible:ring-ring/50 flex h-11 w-full items-center justify-center gap-1 text-sm outline-none focus-visible:ring-2',
                    dia.esHoy ? 'text-primary font-semibold' : 'text-foreground',
                  )}
                >
                  <span>
                    {dia.etiquetaCorta} {dia.numero}
                  </span>
                  <span className="sr-only">
                    , {seleccion ? cuentaDeLibres(huecosDelDia.filter((h) => h.estado === 'libre').length) : cuentaDeCitas(delDia.length)}
                  </span>
                </button>

                <div
                  data-cuerpo
                  ref={i === 0 ? primerCuerpo : undefined}
                  onClick={(evento) => {
                    if (evento.target === evento.currentTarget && alAbrirDia) {
                      alAbrirDia(dia, botonesDia.current[i] ?? evento.currentTarget);
                    }
                  }}
                  className={cn('border-border relative border-t', dia.esHoy && 'bg-muted/40')}
                  style={{ height: alto }}
                >
                  {delDia.map((cita) => (
                    <button
                      key={`${cita.id}-${cita.tramo}`}
                      type="button"
                      data-cita-id={cita.id}
                      tabIndex={i === activo ? 0 : -1}
                      onPointerDown={(evento) => alPulsar(evento, cita)}
                      onKeyDown={(evento) => alTeclearCita(evento, i)}
                      onClick={(evento) => {
                        if (huboArrastre.current) {
                          huboArrastre.current = false;
                          return;
                        }
                        alAbrirCita?.(cita, evento.currentTarget);
                      }}
                      // Con ratón el alto dice la duración; al tacto, 44 px sin tapar a la de debajo (H8, N3).
                      className="bg-card border-border hover:bg-muted focus-visible:ring-ring/50 pointer-coarse:min-h-(--alto-tactil) absolute overflow-hidden rounded-md border p-1 text-left outline-none select-none focus-visible:ring-2"
                      style={{
                        top: (cita.minutoPared - eje.desdeMinuto) * PX_MIN,
                        height: cita.duracionMinutos * PX_MIN,
                        '--alto-tactil': `${altoTactil(cita, delDia)}px`,
                        left: `${(cita.columna / cita.columnasEnGrupo) * 100}%`,
                        width: `${100 / cita.columnasEnGrupo}%`,
                      } as CSSProperties}
                    >
                      <ContenidoCita cita={cita} late />
                    </button>
                  ))}

                  {huecosDelDia.map((hueco) => {
                    const lugar = carriles?.get(hueco.clave) ?? { carril: 0, carriles: 1 };
                    return (
                      <HuecoSeleccion
                        key={hueco.clave}
                        hueco={hueco}
                        elegido={hueco.clave === seleccion?.elegido}
                        alElegir={seleccion?.alElegir ?? (() => {})}
                        className="absolute min-h-0"
                        style={{
                          top: (hueco.minutoPared - eje.desdeMinuto) * PX_MIN,
                          height: hueco.duracionMinutos * PX_MIN,
                          left: `${(lugar.carril / lugar.carriles) * 100}%`,
                          width: `${100 / lugar.carriles}%`,
                        }}
                      />
                    );
                  })}

                  {fantasma?.columna === i && (
                    <div
                      aria-hidden="true"
                      className="border-primary bg-primary/10 text-primary pointer-events-none absolute inset-x-0 rounded-md border-2 border-dashed p-1 font-mono text-xs"
                      style={{
                        top: (fantasma.minuto - eje.desdeMinuto) * PX_MIN,
                        height: fantasma.duracion * PX_MIN,
                      }}
                    >
                      {horaDeMinuto(fantasma.minuto)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
