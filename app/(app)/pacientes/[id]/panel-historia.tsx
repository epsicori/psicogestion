'use client';

import { ClipboardList, Lock, LockOpen } from 'lucide-react';
import { useEffect, useId, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { PanelDePestana, Pestanas } from '@/components/ui/pestanas';
import { Cargando } from '@/components/ui/piezas';
import { t, tCon } from '@/lib/i18n';

import {
  abrirPestanaDeHistoria,
  ampliarLaVentana,
  cerrarHistoriaDelPaciente,
  type ContenidoDelHistorial,
} from './acciones';
import { FormularioPinHistoria } from './formulario-pin-historia';
import { HistorialClinico } from './historial-clinico';
import { minutosRestantes } from './presentacion';

/**
 * La Historia clínica: cuatro sub-pestañas y el candado delante (ADR-026, 037, 048).
 *
 * Es cliente porque tiene estado y reloj, pero **no lee nada**: cada vez que hace falta
 * contenido llama a `abrirPestanaDeHistoria()`, que registra el acceso y devuelve el modelo
 * de vista (ADR-056). Mientras el estado sea `null` lo que se pinta es la pantalla de
 * bloqueo, así que el HTML que sale del servidor —donde el estado siempre empieza en
 * `null`— no lleva ni un fragmento de contenido clínico. No hay capa encima que tapar.
 *
 * El reloj hace dos cosas distintas: repinta los minutos cada medio minuto, y **cierra sola**
 * la historia al llegar a cero. Lo segundo no es cosmético: una historia abierta y olvidada
 * en una mesa compartida deja de ser legible aunque nadie toque nada.
 */

const SUB_PESTANAS = [
  { id: 'historial_clinico', clave: 'ficha.historial' },
  { id: 'notas_clinicas', clave: 'ficha.notas' },
  { id: 'evaluaciones', clave: 'ficha.evaluaciones' },
  { id: 'informes', clave: 'ficha.informes' },
] as const;

type SubPestana = (typeof SUB_PESTANAS)[number]['id'];

type Apertura = {
  caducaEn: string | null;
  vistas: number;
  historial: ContenidoDelHistorial | null;
};

export function PanelHistoria({ pacienteId }: { pacienteId: string }) {
  const prefijo = useId();
  const [subPestana, setSubPestana] = useState<SubPestana>('historial_clinico');
  const [apertura, setApertura] = useState<Apertura | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(true);
  // Se incrementa tras meter el PIN: es lo que hace que el efecto vuelva a pedir la misma
  // sub-pestaña, que de otro modo tendría las mismas dependencias y no se dispararía.
  const [intento, setIntento] = useState(0);
  // `tic` no se lee: existe para repintar los minutos, que se DERIVAN en el renderizado.
  const [, setTic] = useState(0);
  const [trabajando, iniciarTransicion] = useTransition();

  // Dedupe del doble montaje de StrictMode: sin esto, en desarrollo cada entrada contaría
  // dos vistas en `accesos_historia_vistas` y el guion de comprobación manual mentiría.
  const pedida = useRef<string | null>(null);
  // Orden de llegada: si alguien salta de sub-pestaña deprisa manda la última pedida, no la
  // última en resolverse.
  const ultima = useRef(0);

  useEffect(() => {
    const clave = subPestana + ':' + intento;
    if (pedida.current === clave) return;
    pedida.current = clave;

    const token = ultima.current + 1;
    ultima.current = token;
    setCargando(true);

    void abrirPestanaDeHistoria(pacienteId, subPestana).then((resultado) => {
      if (ultima.current !== token) return;
      setCargando(false);

      if (resultado.abierta) {
        setMensaje('');
        setApertura({
          caducaEn: resultado.caducaEn,
          vistas: resultado.vistas,
          historial: resultado.historial,
        });
        return;
      }

      setApertura(null);
      setMensaje(resultado.mensaje);
    });
  }, [pacienteId, subPestana, intento]);

  useEffect(() => {
    const caducaEn = apertura?.caducaEn;
    if (!caducaEn) return;

    // Medio minuto, no un segundo: un número que cambia sin parar es lo que el ADR-047
    // llama parpadear.
    const reloj = setInterval(() => setTic((n) => n + 1), 30_000);
    const cierre = setTimeout(
      () => {
        setApertura(null);
        setMensaje(t('ficha.seCerroSola'));
      },
      Math.max(new Date(caducaEn).getTime() - Date.now(), 0),
    );

    return () => {
      clearInterval(reloj);
      clearTimeout(cierre);
    };
  }, [apertura]);

  const cerrar = () =>
    iniciarTransicion(async () => {
      await cerrarHistoriaDelPaciente();
      setApertura(null);
      setMensaje('');
    });

  const ampliar = () =>
    iniciarTransicion(async () => {
      const { caducaEn } = await ampliarLaVentana();
      setApertura((previa) => (previa ? { ...previa, caducaEn } : previa));
    });

  const minutos = apertura?.caducaEn ? minutosRestantes(apertura.caducaEn) : null;
  const porCaducar = minutos !== null && minutos <= 2;

  return (
    <div className="flex flex-col gap-4">
      <Pestanas
        pestanas={SUB_PESTANAS.map((p) => ({ id: p.id, etiqueta: t(p.clave) }))}
        activa={subPestana}
        alCambiar={(id) => setSubPestana(id as SubPestana)}
        etiqueta={t('ficha.seccionesDeLaHistoria')}
        prefijo={prefijo}
      />

      <PanelDePestana id={subPestana} prefijo={prefijo}>
        {apertura && (
          <div className="flex flex-col gap-4">
            <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
              <p className="flex flex-1 items-center gap-2 text-sm" suppressHydrationWarning>
                <LockOpen className="text-primary size-4" aria-hidden="true" />
                {minutos !== null && minutos > 0
                  ? tCon('ficha.historiaAbiertaMinutos', { minutos })
                  : t('candado.abierta')}
              </p>

              {porCaducar && (
                <Button variante="contorno" onClick={ampliar} disabled={trabajando}>
                  {t('ficha.ampliarElTiempo')}
                </Button>
              )}

              <Button variante="contorno" onClick={cerrar} disabled={trabajando}>
                {t('ficha.cerrarHistoria')}
              </Button>
            </div>

            {porCaducar && (
              // No modal y sin robar el foco (ADR-047): quien está escribiendo una nota no
              // debe perder el cursor porque el candado avise.
              <p
                role="status"
                aria-live="polite"
                className="border-border bg-card rounded-lg border px-4 py-3 text-sm"
              >
                {t('ficha.historiaPorCerrarse')}
              </p>
            )}

            {apertura.vistas > 1 && (
              <p className="text-muted-foreground text-xs">
                {tCon('ficha.vecesEnEstaVentana', { n: apertura.vistas })}
              </p>
            )}

            <Contenido subPestana={subPestana} historial={apertura.historial} />
          </div>
        )}

        {!apertura && cargando && <Cargando filas={4} />}

        {!apertura && !cargando && (
          <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
            <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
              <Lock className="size-5" aria-hidden="true" />
            </span>
            <p className="font-serif text-lg font-semibold">{t('ficha.historiaBloqueada')}</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              {mensaje || t('ficha.historiaBloqueadaExplicacion')}
            </p>
            <div className="mt-2 w-full">
              <FormularioPinHistoria alAbrirse={() => setIntento((n) => n + 1)} />
            </div>
          </div>
        )}
      </PanelDePestana>
    </div>
  );
}

/** Lo que hay dentro de cada sub-pestaña una vez abierta la ventana. */
function Contenido({
  subPestana,
  historial,
}: {
  subPestana: SubPestana;
  historial: ContenidoDelHistorial | null;
}) {
  if (subPestana === 'historial_clinico') {
    return historial ? <HistorialClinico contenido={historial} /> : <Cargando filas={3} />;
  }

  const explicacion =
    subPestana === 'notas_clinicas'
      ? t('ficha.notasEnPreparacion')
      : subPestana === 'evaluaciones'
        ? t('ficha.evaluacionesEnPreparacion')
        : t('ficha.informesEnPreparacion');

  return <EnPreparacion explicacion={explicacion} />;
}

/**
 * Lo que todavía no existe se dice, no se maquilla: ni datos de mentira ni un esqueleto
 * permanente que finja que está cargando.
 */
export function EnPreparacion({ explicacion }: { explicacion: string }) {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
      <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
        <ClipboardList className="size-5" aria-hidden="true" />
      </span>
      <p className="font-serif text-lg font-semibold">{t('ficha.enPreparacion')}</p>
      <p className="text-muted-foreground max-w-sm text-sm">{explicacion}</p>
    </div>
  );
}
