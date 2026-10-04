'use client';

import { useState } from 'react';

import { useFocoRodante } from '@/components/ui/rejilla-foco';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { LeyendaSeleccion } from './leyenda-seleccion';
import type { CalendarioAlta, HuecoVista } from './vista-alta';

type Props = {
  calendario: CalendarioAlta;
  /** La clave `AAAA-MM-DDTHH:MM` del hueco elegido, o null. */
  elegido: string | null;
  /** Se elige un hueco libre: su clave y lo que se enseña de él en el resumen. */
  alElegir: (clave: string, etiqueta: string) => void;
  /** El lunes de la semana que se pide. */
  alCambiarSemana: (lunes: string) => void;
  /** El día (0-6) con que se abre; por defecto, el primero con un hueco libre. */
  diaInicial?: number;
};

function diaPorDefecto(calendario: CalendarioAlta): number {
  const hoy = calendario.dias.findIndex((d) => d.esHoy);
  const conHueco = calendario.huecos.find((h) => h.estado === 'libre')?.diaIndice;
  return conHueco ?? (hoy >= 0 ? hoy : 0);
}

/** La marca que acompaña a un hueco además del color: texto, borde discontinuo o barra. */
function marcas(hueco: HuecoVista, elegido: boolean): string {
  return cn(
    'border-border min-h-11 w-full rounded-lg border p-2 text-left text-sm',
    hueco.sugerida !== null && 'border-dashed',
    hueco.habitual && 'border-l-primary border-l-[3px]',
    elegido ? 'bg-secondary' : 'bg-card hover:bg-muted',
  );
}

/**
 * El calendario de huecos de una semana (T-028, D11): solo «libre» y «ocupado», nunca qué es lo
 * que ocupa un hueco. Siete botones eligen el día y debajo van sus huecos, que es lo que cabe a
 * 360 px sin desplazar en horizontal (ADR-044). Todo llega escrito del servidor (ADR-034).
 */
export function CalendarioSeleccion({ calendario, elegido, alElegir, alCambiarSemana, diaInicial }: Props) {
  const inicial = diaInicial ?? diaPorDefecto(calendario);
  const [dia, setDia] = useState(inicial);
  const { activo, setActivo, alTeclear, refDe } = useFocoRodante(calendario.dias.length, inicial, 7);

  const delDia = calendario.huecos
    .filter((h) => h.diaIndice === dia)
    .sort((a, b) => a.minutoPared - b.minutoPared);

  return (
    <section aria-label={t('agenda.alta.seleccion.titulo')} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => alCambiarSemana(calendario.anterior)}
          className="border-border hover:bg-muted focus-visible:ring-ring/50 min-h-11 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
        >
          {t('agenda.alta.seleccion.semanaAnterior')}
        </button>
        <h3 className="text-center font-serif text-base">{calendario.titulo}</h3>
        <button
          type="button"
          onClick={() => alCambiarSemana(calendario.siguiente)}
          className="border-border hover:bg-muted focus-visible:ring-ring/50 min-h-11 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
        >
          {t('agenda.alta.seleccion.semanaSiguiente')}
        </button>
      </div>

      <div role="group" aria-label={t('agenda.alta.seleccion.diasDeLaSemana')} className="grid grid-cols-4 gap-1 sm:grid-cols-7">
        {calendario.dias.map((d, i) => (
          <button
            key={d.fecha}
            type="button"
            ref={refDe(i)}
            tabIndex={i === activo ? 0 : -1}
            aria-label={d.etiquetaLarga}
            aria-pressed={i === dia}
            aria-current={d.esHoy ? 'date' : undefined}
            onKeyDown={alTeclear}
            onFocus={() => setActivo(i)}
            onClick={() => setDia(i)}
            className={cn(
              'focus-visible:ring-ring/50 flex min-h-11 flex-col items-center justify-center rounded-lg border text-xs outline-none focus-visible:ring-2',
              i === dia ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted',
            )}
          >
            <span>{d.etiquetaCorta}</span>
            <span className="font-mono text-sm">{d.numero}</span>
          </button>
        ))}
      </div>

      <div role="group" aria-label={t('agenda.alta.seleccion.huecosDelDia')}>
        {delDia.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('agenda.alta.seleccion.vacio')}</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {delDia.map((hueco) => {
              const esElegido = hueco.clave === elegido;
              return (
                <li key={hueco.clave}>
                  {hueco.estado === 'libre' ? (
                    <button
                      type="button"
                      aria-pressed={esElegido}
                      aria-label={esElegido ? `${hueco.etiqueta}, ${t('agenda.alta.seleccion.elegida')}` : hueco.etiqueta}
                      onClick={() => alElegir(hueco.clave, hueco.etiqueta)}
                      className={cn(marcas(hueco, esElegido), 'focus-visible:ring-ring/50 outline-none focus-visible:ring-2')}
                    >
                      <span className="font-mono">{hueco.rango}</span>
                      {hueco.habitual && <span className="text-muted-foreground block text-xs">{t('agenda.alta.seleccion.etiquetaHabitual')}</span>}
                    </button>
                  ) : (
                    <div className="bg-muted text-muted-foreground min-h-11 rounded-lg p-2 text-sm">
                      <span className="font-mono">{hueco.rango}</span>
                      <span className="sr-only">, {t('agenda.alta.seleccion.etiquetaOcupado')}</span>
                      <span aria-hidden="true" className="ml-2">{t('agenda.alta.seleccion.etiquetaOcupado')}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <LeyendaSeleccion />
    </section>
  );
}
