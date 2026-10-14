'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { RolUsuario } from '@/components/armazon/modulos';
import { destinoEnAnio } from '@/lib/agenda/anio';
import { sumarMeses } from '@/lib/fechas/calendario';
import { t, tCon } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { ENLACE_BARRA, FiltrosAgenda, SelectorVista } from './barra-agenda';
import { EstadoVacio } from './estado-vacio';
import { ANCHO, FONDO, LeyendaDensidad } from './leyenda-densidad';
import { hrefAgenda, type Vista } from './parametros';
import type { MesAnio, VistaAnio } from './vista-anio';

type Props = {
  vista: VistaAnio;
  /** Lo que venía en la URL, para no perderlo al navegar. */
  parametros: { centro: string | null; profesional: string | null };
  centros: { id: string; nombre: string }[];
  /** `'todos'` o el uuid del centro que filtra: lo que dice el selector. */
  centroElegido: string;
  rol: RolUsuario | null;
};

const ENLACE_DIA =
  'border-card focus-visible:ring-ring/50 flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md border-2 text-xs outline-none focus-visible:ring-2 sm:pointer-fine:min-h-7';

/** Las filas de siete celdas de un mes: `null` es un hueco anterior al día 1 o posterior al último. */
function filasDelMes(mes: MesAnio) {
  const celdas: (MesAnio['dias'][number] | null)[] = [...Array<null>(mes.huecos).fill(null), ...mes.dias];
  while (celdas.length % 7 !== 0) celdas.push(null);
  const filas: typeof celdas[] = [];
  for (let i = 0; i < celdas.length; i += 7) filas.push(celdas.slice(i, i + 7));
  return filas;
}

/**
 * La isla de la vista anual (T-047): doce mini-meses con la densidad de cada día. Recibe la
 * vista ya calculada en servidor (cadenas y números, ningún `Date`). Solo guarda el día en foco,
 * que es el único tabulable (patrón «grid»): las flechas lo mueven, y cada día es un enlace a su
 * semana. El estado de carga y la leyenda no necesitan nada más.
 */
export function CalendarioAnio({ vista, parametros, centros, centroElegido, rol }: Props) {
  const [fechaFoco, setFechaFoco] = useState(vista.fechaFoco);
  /** El foco solo se mueve tras una tecla: al montar, la página no roba el foco. */
  const debeEnfocar = useRef(false);
  const refs = useRef(new Map<string, HTMLAnchorElement>());

  useEffect(() => {
    if (!debeEnfocar.current) return;
    debeEnfocar.current = false;
    refs.current.get(fechaFoco)?.focus();
  }, [fechaFoco]);

  function href(cambios: { vista?: Vista; fecha?: string | null; centro?: string | null; profesional?: string | null }) {
    return hrefAgenda({ vista: 'anio', fecha: null, ...parametros, ...cambios });
  }

  function alTeclear(evento: KeyboardEvent<HTMLAnchorElement>, fecha: string) {
    if (evento.ctrlKey || evento.altKey || evento.metaKey) return;
    const destino = destinoEnAnio(evento.key, fecha, vista.anio);
    if (destino === null) return;
    evento.preventDefault();
    if (destino !== fecha) {
      debeEnfocar.current = true;
      setFechaFoco(destino);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={href({ fecha: sumarMeses(fechaFoco, -12) })}
          aria-label={t('agenda.barra.anioAnterior')}
          className={cn(ENLACE_BARRA, 'w-11 px-0')}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Link>
        <Link href={href({ fecha: null })} className={ENLACE_BARRA}>
          {t('agenda.barra.hoy')}
        </Link>
        <Link
          href={href({ fecha: sumarMeses(fechaFoco, 12) })}
          aria-label={t('agenda.barra.anioSiguiente')}
          className={cn(ENLACE_BARRA, 'w-11 px-0')}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>

        <h2 className="font-serif text-lg">{vista.titulo}</h2>

        <SelectorVista actual="anio" hrefDe={(v) => href({ vista: v, fecha: fechaFoco })} />
      </div>

      <FiltrosAgenda
        centros={centros}
        centroElegido={centroElegido}
        rol={rol}
        profesionales={vista.profesionales}
        profesionalElegido={parametros.profesional}
        hrefCon={(cambios) => href({ fecha: vista.fechaFoco, ...cambios })}
      />

      {vista.total === 0 ? (
        <EstadoVacio
          icono="calendario"
          titulo={tCon('agenda.anio.vacio', { anio: vista.anio })}
          explicacion={t('agenda.anio.vacioExplicacion')}
        />
      ) : (
        <LeyendaDensidad entradas={vista.leyenda} />
      )}

      <div className="contenedor-anio -mx-4 sm:mx-0">
        <div className="meses-anio">
          {vista.meses.map((mes) => (
            <section key={mes.clave} aria-labelledby={`mes-${mes.clave}`}>
              <h3 id={`mes-${mes.clave}`} className="mb-1 px-4 text-sm font-semibold sm:px-0">
                {mes.titulo}
              </h3>
              <div role="grid" aria-labelledby={`mes-${mes.clave}`}>
                <div role="row" className="grid grid-cols-7">
                  {vista.cabeceras.map((c) => (
                    <span
                      key={c.larga}
                      role="columnheader"
                      className="text-muted-foreground py-0.5 text-center text-xs"
                    >
                      <span aria-hidden="true">{c.corta}</span>
                      <span className="sr-only">{c.larga}</span>
                    </span>
                  ))}
                </div>
                {filasDelMes(mes).map((fila, i) => (
                  <div key={i} role="row" className="grid grid-cols-7">
                    {fila.map((dia, j) => {
                      if (dia === null) return <span key={j} role="gridcell" />;
                      return (
                        <span key={dia.fecha} role="gridcell" className="flex">
                          <Link
                            ref={(el) => {
                              if (el) refs.current.set(dia.fecha, el);
                              else refs.current.delete(dia.fecha);
                            }}
                            href={href({ vista: 'semana', fecha: dia.fecha })}
                            prefetch={false}
                            data-dia={dia.fecha}
                            tabIndex={dia.fecha === fechaFoco ? 0 : -1}
                            aria-label={dia.nombre}
                            aria-current={dia.esHoy ? 'date' : undefined}
                            onFocus={() => setFechaFoco(dia.fecha)}
                            onKeyDown={(e) => alTeclear(e, dia.fecha)}
                            className={cn(
                              ENLACE_DIA,
                              'w-full',
                              FONDO[dia.nivel],
                              dia.esHoy && 'font-semibold underline decoration-2 underline-offset-2',
                            )}
                          >
                            <span aria-hidden="true">{dia.numero}</span>
                            <span
                              aria-hidden="true"
                              className={cn(
                                'bg-primary h-[3px] rounded-full forced-color-adjust-none forced-colors:bg-[CanvasText]',
                                ANCHO[dia.nivel],
                              )}
                            />
                          </Link>
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
