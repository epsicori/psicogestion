'use client';

import { t } from '@/lib/i18n';

import { ListaDia } from '../lista-dia';
import { RejillaSemana } from '../rejilla-semana';
import { diaPorDefecto } from './seleccion-huecos';
import { LeyendaSeleccion } from './leyenda-seleccion';
import type { CalendarioAlta } from './vista-alta';

type Props = {
  calendario: CalendarioAlta;
  /** La clave `AAAA-MM-DDTHH:MM` del hueco elegido, o null. */
  elegido: string | null;
  /** Se elige un hueco libre: su clave y lo que se enseña de él en el resumen. */
  alElegir: (clave: string, etiqueta: string) => void;
  /** El lunes de la semana que se pide. */
  alCambiarSemana: (lunes: string) => void;
};

const BOTON_SEMANA =
  'border-border hover:bg-muted focus-visible:ring-ring/50 min-h-11 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2';

/**
 * El calendario de huecos del alta (T-028, D11): la misma semana que la agenda (`RejillaSemana` a
 * partir de `md`, `ListaDia` por debajo) en modo selección. Solo «libre» y «ocupado», nunca qué
 * ocupa un hueco. Todo llega escrito del servidor (ADR-034).
 */
export function SelectorHueco({ calendario, elegido, alElegir, alCambiarSemana }: Props) {
  const diaInicial = diaPorDefecto(calendario.dias, calendario.huecos, elegido);
  // Desde `md` no hay lista que diga el vacío: lo dice la semana entera (H16).
  const semanaSinLibres = !calendario.huecos.some((h) => h.estado === 'libre');
  // La rejilla y la lista llevan `key` por semana: cada semana abre en el día del elegido (o el primero con huecos), no en el que tenía la anterior (H12).
  const seleccion = { huecos: calendario.huecos, elegido, alElegir };

  return (
    <section aria-label={t('agenda.alta.seleccion.titulo')} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => alCambiarSemana(calendario.anterior)} className={BOTON_SEMANA}>
          {t('agenda.alta.seleccion.semanaAnterior')}
        </button>
        <h3 className="text-center font-serif text-base">{calendario.titulo}</h3>
        <button type="button" onClick={() => alCambiarSemana(calendario.siguiente)} className={BOTON_SEMANA}>
          {t('agenda.alta.seleccion.semanaSiguiente')}
        </button>
      </div>

      <div className="hidden md:block">
        {semanaSinLibres && (
          <p className="text-muted-foreground mb-2 text-sm">{t('agenda.alta.seleccion.vacio')}</p>
        )}
        <RejillaSemana
          key={calendario.desde}
          titulo={calendario.titulo}
          dias={calendario.dias}
          eje={calendario.eje}
          diaInicial={diaInicial}
          seleccion={seleccion}
        />
      </div>
      <div className="md:hidden">
        <ListaDia key={calendario.desde} dias={calendario.dias} diaInicial={diaInicial} seleccion={seleccion} />
      </div>

      <LeyendaSeleccion />
    </section>
  );
}
