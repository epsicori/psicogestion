'use client';

import { Casilla } from '@/components/ui/casilla';
import { t, tCon } from '@/lib/i18n';

import { CuerpoSesionPrevista } from './fila-sesion-prevista';
import type { SesionVista } from './vista-alta';

export type CambioDeSerie = { excluir: string[]; aceptar: string[] };

type Props = {
  sesiones: SesionVista[];
  /** Fechas originales que quedan fuera de la serie. */
  excluir: string[];
  /** Fechas originales cuya alternativa se acepta. */
  aceptar: string[];
  alCambiar: (cambio: CambioDeSerie) => void;
};

/**
 * Las sesiones que tendría la serie, para revisarlas antes de guardar. Una sesión con hora se
 * incluye o no; un bloqueo (festivo, ausencia, hueco ocupado) no se da, y si tiene alternativa
 * se puede aceptar. Una fecha no puede estar fuera y aceptada a la vez: el esquema lo exige.
 */
export function PrevisualizacionSerie({ sesiones, excluir, aceptar, alCambiar }: Props) {
  const conHora = sesiones.filter((s) => s.hora !== null);
  const incluidas = conHora.filter((s) => !excluir.includes(s.fecha)).length;
  const todas = conHora.length > 0 && incluidas === conHora.length;
  const algunas = 0 < incluidas && incluidas < conHora.length;

  return (
    <section aria-label={t('agenda.alta.serie.titulo')} className="flex flex-col gap-2">
      <h3 className="font-serif text-base">{t('agenda.alta.serie.titulo')}</h3>

      {conHora.length > 0 && (
        <Casilla
          etiqueta={t('agenda.alta.serie.todasLasSesiones')}
          checked={todas}
          indeterminada={algunas}
          onChange={() =>
            alCambiar({ excluir: todas ? conHora.map((s) => s.fecha) : [], aceptar })
          }
        />
      )}

      <ul className="flex flex-col gap-1">
        {sesiones.map((sesion) => {
          const conBloqueo = sesion.hora === null;
          return (
            <li key={sesion.fecha} className="border-border flex flex-col gap-1 rounded-lg border p-2">
              <CuerpoSesionPrevista
                fecha={sesion.fechaLarga}
                hora={sesion.hora}
                estado={sesion.estado}
                alternativa={sesion.alternativa}
                horaResultante={sesion.horaResultante}
              />
              {!conBloqueo && (
                <Casilla
                  etiqueta={t('agenda.alta.serie.incluir')}
                  aria-label={tCon('agenda.alta.serie.incluirSesion', { fecha: sesion.fechaLarga })}
                  checked={!excluir.includes(sesion.fecha)}
                  onChange={(evento) =>
                    alCambiar({
                      excluir: evento.target.checked ? excluir.filter((f) => f !== sesion.fecha) : [...excluir, sesion.fecha],
                      aceptar,
                    })
                  }
                />
              )}
              {conBloqueo && sesion.alternativa !== null && (
                <Casilla
                  etiqueta={t('agenda.alta.serie.aceptarAlternativa')}
                  aria-label={tCon('agenda.alta.serie.aceptarAlternativaSesion', { fecha: sesion.fechaLarga })}
                  checked={aceptar.includes(sesion.fecha)}
                  onChange={(evento) =>
                    alCambiar({
                      excluir,
                      aceptar: evento.target.checked ? [...aceptar, sesion.fecha] : aceptar.filter((f) => f !== sesion.fecha),
                    })
                  }
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
