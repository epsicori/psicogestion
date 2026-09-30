'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Dialogo } from '@/components/ui/dialogo';
import { Field } from '@/components/ui/field';
import { mensajeParaMotivo } from '@/lib/citas/errores';
import { esquemaDestinoCita, type DatosDestinoCita } from '@/lib/citas/esquemas';
import { t, tCon } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { previsualizarMovimiento, reprogramar, type ResultadoAccion, type ResultadoPrevisualizar } from './acciones';
import type { CitaVista, DiaVista } from './vista';

type Alcance = 'esta' | 'esta_y_siguientes';

type Props = {
  cita: CitaVista;
  zona: string;
  dias: DiaVista[];
  /** El destino con que se abre: el del arrastre o el de la cita misma. */
  inicial: { fecha: string; hora: string };
  desdeArrastre: boolean;
  alCerrar: () => void;
  /** Con el anuncio ya redactado por el servidor: quien llama cierra, anuncia y enfoca. */
  alMovida: (anuncio: string) => void;
};

/** Cuánto se espera tras la última tecla antes de volver a preguntar a la base. */
const ESPERA_MS = 300;

type Previa = { clave: string; resultado: ResultadoPrevisualizar };

/**
 * Mover una cita: el día y la hora, y, si es de una serie, la pregunta que el ADR-068 obliga a
 * hacer («¿mantener la serie o modificarla desde aquí?»). Sin opción marcada de antemano y sin
 * «todas». «Modificar» solo se ofrece cuando la previsualización de ESTE destino ha vuelto y
 * dice que se puede; la firma que devuelve es la que viaja al enviar (§8.3).
 */
export function DialogoReprogramar({ cita, zona, dias, inicial, desdeArrastre, alCerrar, alMovida }: Props) {
  const prefijo = useId();
  const deSerie = cita.deSerie;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<DatosDestinoCita>({
    resolver: zodResolver(esquemaDestinoCita),
    defaultValues: { citaId: cita.id, fecha: inicial.fecha, hora: inicial.hora, zona },
  });
  const fecha = useWatch({ control, name: 'fecha' });
  const hora = useWatch({ control, name: 'hora' });

  const [alcance, setAlcance] = useState<Alcance | null>(null);
  const [falta, setFalta] = useState(false);
  const [intentosSinElegir, setIntentosSinElegir] = useState(0);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [version, setVersion] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const refMantener = useRef<HTMLInputElement>(null);
  const refFecha = useRef<HTMLInputElement | null>(null);
  const haRespondido = useRef(false);
  const versionVista = useRef(0);

  const clave = `${fecha}|${hora}`;
  const destinoValido = esquemaDestinoCita.safeParse({ citaId: cita.id, fecha, hora, zona }).success;

  // La previsualización sigue al destino. Cada respuesta lleva la clave con que se pidió: una
  // que llega tarde, de un destino que ya no es el de la pantalla, se ignora.
  useEffect(() => {
    if (!deSerie || !destinoValido) return;
    let vigente = true;
    // La primera pregunta y la que sigue a una caducidad salen sin espera; teclear, con ella.
    const inmediata = versionVista.current !== version;
    versionVista.current = version;
    const espera = haRespondido.current && !inmediata ? ESPERA_MS : 0;
    const temporizador = setTimeout(async () => {
      // Una acción que rechaza (red, 500) no deja «Calculando…» para siempre (revisión TS H6).
      let resultado: ResultadoPrevisualizar;
      try {
        resultado = await previsualizarMovimiento({ citaId: cita.id, fecha, hora, zona });
      } catch {
        resultado = { ok: false, mensaje: mensajeParaMotivo('desconocido') };
      }
      if (!vigente) return;
      haRespondido.current = true;
      setPrevia({ clave: `${fecha}|${hora}`, resultado });
    }, espera);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [deSerie, destinoValido, cita.id, fecha, hora, zona, version]);

  const fresca = previa && previa.clave === clave ? previa.resultado : null;
  const cargando = deSerie && destinoValido && fresca === null;
  const general = fresca?.ok ? fresca.general : null;
  const modificarDisponible = fresca?.ok === true && fresca.modificar.disponible && general === null;
  const mantenerDisponible = general === null;

  // Una opción marcada que deja de estar disponible (cambió el destino) no cuenta.
  const elegida: Alcance | null =
    alcance === 'esta' && mantenerDisponible
      ? 'esta'
      : alcance === 'esta_y_siguientes' && modificarDisponible
        ? 'esta_y_siguientes'
        : null;

  const etiquetaDia = dias.find((d) => d.fecha === fecha)?.etiquetaLarga ?? fecha;
  const destino =
    fresca?.ok === true ? fresca.destino : tCon('agenda.moverSerie.destino', { fecha: etiquetaDia, hora });

  const idElige = `${prefijo}-elige`;
  const idGeneral = `${prefijo}-general`;
  const idMantener = `${prefijo}-mantener`;
  const idModificar = `${prefijo}-modificar`;

  // El foco va al primer radio cuando se pulsa Mover sin haber elegido.
  useEffect(() => {
    if (intentosSinElegir > 0) refMantener.current?.focus();
  }, [intentosSinElegir]);

  const cerrar = () => {
    if (!enviando) alCerrar();
  };

  const enviar = handleSubmit(async (datos) => {
    if (enviando) return;
    if (deSerie && elegida === null) {
      setFalta(true);
      setIntentosSinElegir((n) => n + 1);
      return;
    }
    setError('');
    setEnviando(true);
    const base = { citaId: datos.citaId, fecha: datos.fecha, hora: datos.hora, zona: datos.zona };
    let carga: Record<string, string> = base;
    if (deSerie && elegida === 'esta') carga = { ...base, alcance: 'esta' };
    if (deSerie && elegida === 'esta_y_siguientes' && fresca?.ok === true && fresca.modificar.disponible) {
      carga = { ...base, alcance: 'esta_y_siguientes', firma: fresca.modificar.firma };
    }
    // Si la acción rechaza, `enviando` no puede quedarse en true: el modal atraparía el foco
    // con Escape y Cancelar ignorados hasta recargar (revisión TS H6, WCAG 2.1.2).
    let r: ResultadoAccion;
    try {
      r = await reprogramar(carga);
    } catch {
      r = { ok: false, motivo: 'desconocido', detalle: null, mensaje: mensajeParaMotivo('desconocido') };
    } finally {
      setEnviando(false);
    }
    if (r.ok) {
      alMovida(r.anuncio);
      return;
    }
    if (r.motivo === 'previsualizacion_caducada') {
      // La serie cambió mientras decidía: se avisa, se vuelve a previsualizar y se conserva
      // su elección; tendrá que pulsar Mover otra vez sobre el resumen nuevo.
      setError(t('agenda.moverSerie.caducada'));
      setPrevia(null);
      setVersion((v) => v + 1);
      return;
    }
    setError(r.mensaje);
  });

  const { ref: refRegistroFecha, ...registroFecha } = register('fecha');

  return (
    <Dialogo
      abierto
      alCerrar={cerrar}
      titulo={deSerie ? t('agenda.moverSerie.titulo') : t('agenda.reprogramar.titulo')}
      focoInicial={deSerie && desdeArrastre ? refMantener : refFecha}
    >
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field
            id={`${prefijo}-fecha`}
            type="date"
            etiqueta={t('agenda.reprogramar.fecha')}
            errores={errors.fecha?.message ? [errors.fecha.message] : undefined}
            {...registroFecha}
            ref={(nodo: HTMLInputElement | null) => {
              refFecha.current = nodo;
              refRegistroFecha(nodo);
            }}
          />
          <Field
            id={`${prefijo}-hora`}
            type="time"
            etiqueta={t('agenda.reprogramar.hora')}
            errores={errors.hora?.message ? [errors.hora.message] : undefined}
            {...register('hora')}
          />
        </div>

        <p className="text-sm font-medium">{destino}</p>

        {deSerie && (
          <fieldset
            aria-invalid={falta && elegida === null ? true : undefined}
            aria-describedby={falta && elegida === null ? idElige : undefined}
            className="flex flex-col gap-3"
          >
            <legend className="mb-1 text-sm font-medium">{t('agenda.moverSerie.pregunta')}</legend>

            {general !== null && (
              <p id={idGeneral} className="text-muted-foreground text-sm">
                {general}
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label
                className={cn(
                  'flex min-h-11 items-start gap-3 rounded-lg py-2 text-sm',
                  mantenerDisponible ? 'cursor-pointer' : 'cursor-not-allowed opacity-70',
                )}
              >
                <input
                  ref={refMantener}
                  type="radio"
                  name={`${prefijo}-alcance`}
                  checked={elegida === 'esta'}
                  disabled={!mantenerDisponible}
                  onChange={() => setAlcance('esta')}
                  aria-describedby={general !== null ? `${idGeneral} ${idMantener}` : idMantener}
                  className="accent-primary mt-0.5 size-5 shrink-0"
                />
                {t('agenda.moverSerie.mantener')}
              </label>
              <p id={idMantener} className="text-muted-foreground pl-8 text-sm">
                {t('agenda.moverSerie.mantenerDetalle')}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className={cn(
                  'flex min-h-11 items-start gap-3 rounded-lg py-2 text-sm',
                  modificarDisponible ? 'cursor-pointer' : 'cursor-not-allowed opacity-70',
                )}
              >
                <input
                  type="radio"
                  name={`${prefijo}-alcance`}
                  checked={elegida === 'esta_y_siguientes'}
                  disabled={!modificarDisponible}
                  onChange={() => setAlcance('esta_y_siguientes')}
                  aria-describedby={idModificar}
                  className="accent-primary mt-0.5 size-5 shrink-0"
                />
                {t('agenda.moverSerie.modificar')}
              </label>
              <div
                id={idModificar}
                aria-live="polite"
                aria-busy={cargando}
                className="text-muted-foreground flex flex-col gap-1 pl-8 text-sm"
              >
                {cargando && <p>{t('agenda.moverSerie.calculando')}</p>}
                {fresca?.ok === true && fresca.modificar.disponible && general === null && (
                  <>
                    <p>{fresca.modificar.descripcion.ahora}</p>
                    <p>{fresca.modificar.descripcion.despues}</p>
                    <p>{fresca.modificar.descripcion.alcance}</p>
                    {fresca.modificar.descripcion.avisos.length > 0 && (
                      <ul className="list-disc pl-5">
                        {fresca.modificar.descripcion.avisos.map((aviso) => (
                          <li key={aviso}>{aviso}</li>
                        ))}
                      </ul>
                    )}
                    <p>{t('agenda.moverSerie.confirmacion')}</p>
                  </>
                )}
                {fresca?.ok === true && !fresca.modificar.disponible && fresca.modificar.mensaje !== '' && (
                  <p>{fresca.modificar.mensaje}</p>
                )}
                {fresca?.ok === false && <p>{fresca.mensaje}</p>}
              </div>
            </div>

            {falta && elegida === null && (
              <p id={idElige} className="text-destructive text-sm">
                {t('agenda.moverSerie.elige')}
              </p>
            )}
          </fieldset>
        )}

        {error !== '' && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variante="contorno" onClick={cerrar}>
            {t('agenda.moverSerie.cancelar')}
          </Button>
          <Button
            type="submit"
            aria-disabled={enviando || undefined}
            onClick={(evento) => {
              if (enviando) evento.preventDefault();
            }}
          >
            {enviando ? t('agenda.moverSerie.moviendo') : t('agenda.moverSerie.mover')}
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}
