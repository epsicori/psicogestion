'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Desplegable, type OpcionDesplegable } from '@/components/ui/desplegable';
import { Dialogo } from '@/components/ui/dialogo';
import { t, tCon } from '@/lib/i18n';

import { darAltaDeCentro, retirarAltaDeCentro } from '../acciones';

export type AltaVigente = {
  centroId: string;
  nombre: string;
  principal: boolean;
  /** Ya formateada en servidor (`dd/MM/aaaa`): el cliente no formatea fechas. */
  desde: string;
};

export type PersonaConAltas = {
  perfilId: string;
  nombre: string;
  /** Etiqueta del rol, ya traducida. */
  rol: string;
  tienePrincipal: boolean;
  altas: AltaVigente[];
};

type Props = {
  personas: PersonaConAltas[];
  centros: OpcionDesplegable[];
};

type Confirmacion = {
  tipo: 'dar' | 'retirar';
  perfilId: string;
  centroId: string;
  nombre: string;
  centro: string;
  /** Dar: la persona no tiene principal y este lo será. Retirar: este es su principal. */
  tocaPrincipal: boolean;
};

/**
 * Altas de centro (T-041). Una lista con confirmación explícita, no tarjetas ni arrastre
 * (ADR-051). La pantalla no adivina si el cambio se puede hacer: lo que rechaza la base
 * —un centro cerrado, un alta que ya no está vigente— vuelve como mensaje y se enseña
 * dentro del diálogo, que sigue abierto.
 *
 * Foco: con éxito el diálogo se cierra y el foco va al mensaje de estado, no al botón que
 * lo abrió: tras retirar un alta, ese botón desaparece con la revalidación y
 * `useDevolucionDeFoco` no tendría adónde volver.
 */
export function GestionAltas({ personas, centros }: Props) {
  const [enviando, iniciarTransicion] = useTransition();
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [errorDialogo, setErrorDialogo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enfoquesDelEstado, setEnfoquesDelEstado] = useState(0);
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [centroId, setCentroId] = useState<string | null>(null);

  const cancelar = useRef<HTMLButtonElement>(null);
  const estado = useRef<HTMLParagraphElement>(null);

  // Los efectos del padre corren después de las limpiezas del diálogo, y una de ellas
  // devuelve el foco al botón que lo abrió: este efecto va detrás y lo deja en el estado.
  useEffect(() => {
    if (enfoquesDelEstado > 0) estado.current?.focus();
  }, [enfoquesDelEstado]);

  const persona = personas.find((p) => p.perfilId === perfilId) ?? null;
  const centrosLibres = persona
    ? centros.filter((c) => !persona.altas.some((alta) => alta.centroId === c.valor))
    : centros;
  const centroElegido = centrosLibres.find((c) => c.valor === centroId) ?? null;

  function abrir(nueva: Confirmacion) {
    setErrorDialogo('');
    setConfirmacion(nueva);
  }

  function cerrar() {
    if (enviando) return;
    setConfirmacion(null);
    setErrorDialogo('');
  }

  function confirmar() {
    if (!confirmacion || enviando) return;
    const { tipo, perfilId: perfil, centroId: centro } = confirmacion;
    setErrorDialogo('');
    iniciarTransicion(async () => {
      const accion = tipo === 'dar' ? darAltaDeCentro : retirarAltaDeCentro;
      let resultado: Awaited<ReturnType<typeof accion>> | undefined;
      try {
        resultado = await accion({ perfilId: perfil, centroId: centro });
      } catch (error) {
        // Una Server Action que lanza (red caída, 500) no debe dejar el diálogo mudo.
        console.error('GestionAltas: la acción lanzó', error);
        setErrorDialogo(t('altasCentro.noGuardado'));
        return;
      }
      if (!resultado?.ok) {
        setErrorDialogo(resultado?.mensaje ?? t('altasCentro.noGuardado'));
        return;
      }
      if (tipo === 'dar') setCentroId(null);
      setConfirmacion(null);
      setMensaje(resultado.mensaje ?? '');
      setEnfoquesDelEstado((n) => n + 1);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {personas.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('altasCentro.sinPersonas')}</p>
      ) : (
        <ul className="divide-border border-border flex flex-col divide-y rounded-lg border">
          {personas.map((p) => (
            <li key={p.perfilId} className="flex flex-col gap-2 px-4 py-3">
              <p className="text-sm">
                <span className="font-medium">{p.nombre}</span>
                <span className="text-muted-foreground"> · {p.rol}</span>
              </p>
              {p.altas.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('altasCentro.sinAltas')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {p.altas.map((alta) => (
                    <li key={alta.centroId} className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm">
                        <span>{alta.nombre}</span>
                        {alta.principal && (
                          <>
                            {' · '}
                            <span className="font-medium">{t('altasCentro.principal')}</span>
                          </>
                        )}
                        {' · '}
                        <span className="text-muted-foreground">
                          {tCon('altasCentro.desde', { fecha: alta.desde })}
                        </span>
                      </p>
                      <Button
                        variante="contorno"
                        aria-label={tCon('altasCentro.retirarEtiqueta', { nombre: p.nombre, centro: alta.nombre })}
                        onClick={() =>
                          abrir({
                            tipo: 'retirar',
                            perfilId: p.perfilId,
                            centroId: alta.centroId,
                            nombre: p.nombre,
                            centro: alta.nombre,
                            tocaPrincipal: alta.principal,
                          })
                        }
                      >
                        {t('altasCentro.retirar')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {personas.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t('altasCentro.tituloDar')}</h2>
          <Desplegable
            etiqueta={t('altasCentro.persona')}
            marcador={t('altasCentro.elegirPersona')}
            opciones={personas.map((p) => ({ valor: p.perfilId, etiqueta: p.nombre }))}
            valor={perfilId}
            alElegir={(valor) => {
              setPerfilId(valor);
              setCentroId(null);
            }}
          />
          {persona && centrosLibres.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('altasCentro.sinCentrosLibres')}</p>
          ) : (
            <Desplegable
              etiqueta={t('altasCentro.centro')}
              marcador={t('altasCentro.elegirCentro')}
              opciones={centrosLibres}
              valor={centroElegido?.valor ?? null}
              alElegir={setCentroId}
            />
          )}
          <Button
            disabled={!persona || !centroElegido || enviando}
            onClick={() => {
              if (!persona || !centroElegido) return;
              abrir({
                tipo: 'dar',
                perfilId: persona.perfilId,
                centroId: centroElegido.valor,
                nombre: persona.nombre,
                centro: centroElegido.etiqueta,
                tocaPrincipal: !persona.tienePrincipal,
              });
            }}
          >
            {t('altasCentro.darAlta')}
          </Button>
        </section>
      )}

      <p ref={estado} role="status" tabIndex={-1} className="text-sm outline-none">
        {mensaje}
      </p>

      <Dialogo
        abierto={confirmacion !== null}
        alCerrar={cerrar}
        titulo={confirmacion?.tipo === 'dar' ? t('altasCentro.tituloDar') : t('altasCentro.tituloRetirar')}
        focoInicial={cancelar}
      >
        {confirmacion && (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              {tCon(confirmacion.tipo === 'dar' ? 'altasCentro.confirmacion.dar' : 'altasCentro.confirmacion.retirar', {
                nombre: confirmacion.nombre,
                centro: confirmacion.centro,
              })}
            </p>
            {confirmacion.tocaPrincipal && (
              <p className="text-sm font-medium">
                {confirmacion.tipo === 'dar'
                  ? tCon('altasCentro.confirmacion.darPrincipal', { centro: confirmacion.centro })
                  : t('altasCentro.confirmacion.retirarPrincipal')}
              </p>
            )}
            {errorDialogo && (
              <p role="alert" className="text-destructive text-sm">
                {errorDialogo}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {/* aria-disabled y no disabled: un botón con foco que pasa a disabled lo suelta
                  a BODY y el diálogo pierde el foco (patrón T-028 H27). La guarda está en los
                  manejadores. */}
              <Button
                onClick={confirmar}
                aria-disabled={enviando || undefined}
                className="aria-disabled:opacity-50"
              >
                {enviando ? t('comunes.cargando') : t('ajustes.confirmacion.confirmar')}
              </Button>
              <Button
                ref={cancelar}
                variante="contorno"
                onClick={cerrar}
                aria-disabled={enviando || undefined}
                className="aria-disabled:opacity-50"
              >
                {t('ajustes.confirmacion.cancelar')}
              </Button>
            </div>
          </div>
        )}
      </Dialogo>
    </div>
  );
}
