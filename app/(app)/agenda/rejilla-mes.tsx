'use client';

import { PuntoEstadoCita, type EstadoVisibleCita } from '@/components/ui/estado-cita';
import { useFocoRodante } from '@/components/ui/rejilla-foco';
import { t, tCon } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { horaDeCita } from './contenido-cita';
import type { CitaVista, DiaVista } from './vista';

type Props = {
  titulo: string;
  /** Los 42 días de las seis filas, empezando por un lunes. */
  dias: DiaVista[];
  citas: CitaVista[];
  diaInicial: number;
  alAbrirDia: (dia: DiaVista, ancla: HTMLElement) => void;
  alAbrirCita: (cita: CitaVista, ancla: HTMLElement) => void;
};

/** El orden de la leyenda. */
const ORDEN_ESTADOS: EstadoVisibleCita[] = [
  'programada',
  'confirmada',
  'en_curso',
  'realizada',
  'cancelada',
  'no_asistida',
];

const CITAS_VISIBLES = 3;

function cuentaDeCitas(n: number): string {
  if (n === 0) return t('agenda.rejilla.sinCitas');
  return n === 1 ? t('agenda.rejilla.citas.una') : tCon('agenda.rejilla.citas.varias', { n });
}

/**
 * El mes (T-014 §1.6.3): seis filas de siete celdas. Cada celda tiene el número del día como
 * botón (con tabulación móvil) y, a partir de `sm`, hasta tres citas y un «+N más» que abre el
 * día; por debajo, un punto por estado presente y el total. Nada late en el mes.
 */
export function RejillaMes({ titulo, dias, citas, diaInicial, alAbrirDia, alAbrirCita }: Props) {
  const { activo, setActivo, alTeclear, refDe } = useFocoRodante(dias.length, diaInicial, 7);

  const filas = Array.from({ length: Math.ceil(dias.length / 7) }, (_, f) => dias.slice(f * 7, f * 7 + 7));
  const cabeceras = dias.slice(0, 7);

  return (
    // Por debajo de sm la rejilla sangra el relleno de la tarjeta (p-4 en `page.tsx`): siete
    // columnas a 360 px dan ≈ 45 px en vez de ≈ 41, y el número del día llega a 44 (evidencia, FALLA 2).
    <div
      role="grid"
      aria-label={titulo}
      className="border-border -mx-4 overflow-hidden border-y sm:mx-0 sm:rounded-lg sm:border"
    >
      <div role="row" className="bg-muted grid grid-cols-7">
        {cabeceras.map((dia) => (
          <div
            key={dia.fecha}
            role="columnheader"
            className="text-muted-foreground py-1.5 text-center text-xs font-medium"
          >
            {dia.etiquetaCorta}
          </div>
        ))}
      </div>

      {filas.map((fila, f) => (
        <div key={fila[0].fecha} role="row" className="grid grid-cols-7">
          {fila.map((dia, c) => {
            const indice = f * 7 + c;
            const delDia = citas
              .filter((cita) => cita.diaIndice === indice)
              .sort((a, b) => a.minutoPared - b.minutoPared || a.tramo - b.tramo);
            const visibles = delDia.slice(0, CITAS_VISIBLES);
            const restantes = delDia.length - visibles.length;
            const estados = ORDEN_ESTADOS.filter((e) => delDia.some((cita) => cita.estado === e));

            return (
              <div
                key={dia.fecha}
                role="gridcell"
                // Tocar la celda fuera de sus botones (los puntos, el recuento, el hueco) abre el
                // día como su número (evidencia, FALLA 1). El teclado entra por el número.
                onClick={(evento) => {
                  if ((evento.target as Element).closest('button')) return;
                  const numero = evento.currentTarget.querySelector<HTMLElement>('[data-dia]');
                  alAbrirDia(dia, numero ?? evento.currentTarget);
                }}
                className="border-border flex min-h-16 min-w-0 flex-col gap-0.5 border-t border-l p-0 first:border-l-0 sm:min-h-28 sm:p-0.5"
              >
                <button
                  type="button"
                  data-dia={dia.fecha}
                  ref={refDe(indice)}
                  tabIndex={indice === activo ? 0 : -1}
                  aria-current={dia.esHoy ? 'date' : undefined}
                  onKeyDown={alTeclear}
                  onFocus={() => setActivo(indice)}
                  onClick={(evento) => alAbrirDia(dia, evento.currentTarget)}
                  className={cn(
                    // Compacto solo con ratón: al tacto sigue en 44 px (revisión TS H8).
                    'hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 items-center justify-center rounded-md text-sm outline-none focus-visible:ring-2 sm:justify-start sm:px-1 sm:pointer-fine:min-h-7',
                    dia.delMes ? 'text-foreground' : 'text-muted-foreground',
                    dia.esHoy && 'text-primary font-semibold',
                  )}
                >
                  <span>{dia.numero}</span>
                  <span className="sr-only">, {cuentaDeCitas(delDia.length)}</span>
                </button>

                <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {visibles.map((cita) => (
                    <button
                      key={`${cita.id}-${cita.tramo}`}
                      type="button"
                      data-cita-id={cita.id}
                      tabIndex={indice === activo ? 0 : -1}
                      onClick={(evento) => alAbrirCita(cita, evento.currentTarget)}
                      className="hover:bg-muted focus-visible:ring-ring/50 pointer-coarse:min-h-11 flex min-h-6 items-center gap-1 rounded px-1 text-left text-xs outline-none focus-visible:ring-2"
                    >
                      <span className="truncate">
                        {tCon('agenda.cita.horaYNombre', { hora: horaDeCita(cita), nombre: cita.nombreCorto })}
                      </span>
                      <PuntoEstadoCita estado={cita.estado} conEtiqueta={false} late={false} />
                    </button>
                  ))}
                  {restantes > 0 && (
                    <button
                      type="button"
                      tabIndex={indice === activo ? 0 : -1}
                      onClick={(evento) => alAbrirDia(dia, evento.currentTarget)}
                      className="text-muted-foreground hover:bg-muted focus-visible:ring-ring/50 pointer-coarse:min-h-11 min-h-6 rounded px-1 text-left text-xs outline-none focus-visible:ring-2"
                    >
                      {tCon('agenda.rejilla.masCitas', { n: restantes })}
                    </button>
                  )}
                </div>

                {delDia.length > 0 && (
                  <div data-puntos className="flex flex-wrap items-center justify-center gap-1 sm:hidden">
                    {estados.map((estado) => (
                      <PuntoEstadoCita key={estado} estado={estado} conEtiqueta={false} late={false} />
                    ))}
                    <span aria-hidden="true" className="font-mono text-xs">
                      {delDia.length}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
