'use client';

import { useActionState, useEffect, useEffectEvent, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Pildora } from '@/components/ui/piezas';
import type { DetalleRechazo } from '@/lib/citas/tipos';
import { t, tCon } from '@/lib/i18n';

import { confirmarPropuestaAgenda, descartarPropuestaAgenda, type ResultadoAccion } from './acciones';

/**
 * Los rechazos tras los cuales «Confirmar» ya no tiene sentido (T-014 §8.5, columna «¿Sigue
 * Confirmar?»). `hueco_ocupado` y `desconocido` son pasajeros: se puede reintentar.
 */
const DETALLES_PERMANENTES: readonly DetalleRechazo[] = [
  'yaEmpezada',
  'canceladaOCerrada',
  'movidaAMano',
  'propuestaPasada',
  'sinEvento',
  'otraRegla',
  'otraZona',
  'citaCambiada',
  'sinHorario',
];

function esPermanente(estado: ResultadoAccion | null): boolean {
  if (estado === null || estado.ok) return false;
  return estado.motivo === 'no_autorizado' || (estado.detalle !== null && DETALLES_PERMANENTES.includes(estado.detalle));
}

type Props = {
  /** El id de la propuesta. */
  id: string;
  /** Nombre corto del paciente; `null` en el panel de la cita, que ya lo dice. */
  nombre: string | null;
  /** «Prevista el 1 oct a las 10:00», ya formateada en el servidor; vacía en el panel de la cita. */
  prevista: string;
  /** El motivo, ya en texto; vacío en el panel de la cita. */
  motivo: string;
  /** «Propuesta: 11:00–11:50», o `null` si la propuesta no trae horario (solo se puede descartar). */
  propuesta: string | null;
  /** La propuesta cae en una hora que cambia por el horario de verano (§8.3). */
  cambioDeHora?: boolean;
  /**
   * Con el «Hecho.» de un éxito (revisión TS H9). La fila se va con el recargado y se llevaría
   * el foco a `body`: quien la contiene anuncia y decide adónde va el foco.
   */
  alResuelta?: (anuncio: string) => void;
};

/**
 * Una propuesta de cambio por confirmar: la fila de «Por confirmar» y el bloque del panel de la
 * cita (T-014 §8.2 y §8.5). Guarda el último rechazo: la fila **no desaparece**, porque tras un
 * fallo no hay `revalidatePath` y la lista del servidor no cambia. Con un rechazo permanente
 * retira «Confirmar» y pasa el foco a «Descartar» (que se lee con su motivo), para que el foco
 * no caiga a `body` al desaparecer el botón enfocado.
 */
export function FilaPropuesta({ id, nombre, prevista, motivo, propuesta, cambioDeHora = false, alResuelta }: Props) {
  const [estadoConfirmar, confirmar, confirmando] = useActionState<ResultadoAccion | null>(
    () => confirmarPropuestaAgenda({ propuestaId: id }),
    null,
  );
  const [estadoDescartar, descartar, descartando] = useActionState<ResultadoAccion | null>(
    () => descartarPropuestaAgenda({ propuestaId: id }),
    null,
  );
  const botonDescartar = useRef<HTMLButtonElement>(null);
  const idMotivo = useId();

  const permanente = esPermanente(estadoConfirmar);
  useEffect(() => {
    if (permanente) botonDescartar.current?.focus();
  }, [permanente, estadoConfirmar]);

  // Una vez por resultado: el callback puede cambiar en cada repintado del padre.
  const avisar = useEffectEvent((anuncio: string) => alResuelta?.(anuncio));
  useEffect(() => {
    if (estadoConfirmar?.ok) avisar(estadoConfirmar.anuncio);
  }, [estadoConfirmar]);
  useEffect(() => {
    if (estadoDescartar?.ok) avisar(estadoDescartar.anuncio);
  }, [estadoDescartar]);

  // El último resultado de cualquiera de las dos acciones; un `ok` lo lleva la lista al recargar.
  const ultimo = estadoDescartar && !estadoDescartar.ok ? estadoDescartar : estadoConfirmar;
  const fallo = ultimo && !ultimo.ok ? ultimo : null;
  const pendiente = confirmando || descartando;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {nombre !== null && <span className="font-medium text-foreground">{nombre}</span>}
        {prevista !== '' && <span className="text-foreground">{prevista}</span>}
        {permanente && <Pildora tono="warning">{t('agenda.rechazos.yaNoVale')}</Pildora>}
      </div>
      {motivo !== '' && <p className="text-muted-foreground">{motivo}</p>}
      <p className="text-foreground">{propuesta ?? t('agenda.porConfirmar.sinPropuesta')}</p>
      {cambioDeHora && <p className="text-muted-foreground">{t('agenda.rechazos.cambioDeHora')}</p>}

      {permanente && fallo && (
        <p id={idMotivo} className="text-foreground">
          {tCon('agenda.rechazos.noConfirmada', { motivo: fallo.mensaje })} {t('agenda.rechazos.descartala')}
        </p>
      )}
      {/* Siempre montada: un `role="status"` que aparece con el texto ya dentro no se anuncia. */}
      <p role="status" className="text-foreground min-h-0">
        {pendiente ? t('agenda.porConfirmar.enCurso') : !permanente && fallo ? fallo.mensaje : ''}
      </p>

      <div className="flex flex-wrap gap-2">
        {propuesta !== null && !permanente && (
          <form action={confirmar}>
            <Button type="submit" tamano="sm" aria-disabled={pendiente || undefined}
            onClick={(e) => pendiente && e.preventDefault()}>
              {t('agenda.porConfirmar.confirmar')}
            </Button>
          </form>
        )}
        <form action={descartar}>
          <Button
            ref={botonDescartar}
            type="submit"
            tamano="sm"
            variante="contorno"
            aria-disabled={pendiente || undefined}
            onClick={(e) => pendiente && e.preventDefault()}
            aria-describedby={permanente ? idMotivo : undefined}
          >
            {t('agenda.porConfirmar.descartar')}
          </Button>
        </form>
      </div>
    </div>
  );
}
