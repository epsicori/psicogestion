"use client";

import { Bell } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Emergente } from "@/components/ui/emergente";
import type { NotificacionVista } from "@/lib/citas/avisos";
import { t, tCon, type ClaveDeCatalogo } from "@/lib/i18n";
import { es } from "@/lib/i18n/es";

import { marcarNotificacionLeida, marcarTodasLeidas } from "./acciones-avisos";

/**
 * Campana de notificaciones (T-015 §1.6): un `Emergente` no modal con la lista. Solo se puede
 * **marcar como leída**: ninguna acción destructiva, la notificación es histórica (ADR-038).
 * El texto de cada una lo escribe quien la genera y nunca lleva contenido clínico.
 */

type Props = { notificaciones: NotificacionVista[] };
type PromesaOk = Promise<{ ok: boolean }>;

/** El título: el propio, o la etiqueta del tipo, o «Aviso» si el tipo no está en el catálogo. */
function tituloDe(notificacion: NotificacionVista): string {
  if (notificacion.titulo) return notificacion.titulo;
  const etiquetas = es.notificaciones.tipos as Record<string, string>;
  return Object.hasOwn(etiquetas, notificacion.tipo)
    ? t(`notificaciones.tipos.${notificacion.tipo}` as ClaveDeCatalogo)
    : t("notificaciones.tipos.otro");
}

/** Presentación de una notificación: título, detalle, fecha y, si no está leída, su botón. */
function ElementoNotificacion({
  notificacion,
  onMarcar,
}: {
  notificacion: NotificacionVista;
  onMarcar: (id: string) => void;
}) {
  return (
    <li className="border-border flex flex-col gap-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p className={notificacion.leida ? "font-medium" : "font-semibold"}>
          {!notificacion.leida && (
            <span
              aria-hidden="true"
              className="bg-primary mr-2 inline-block size-2 rounded-full"
            />
          )}
          {tituloDe(notificacion)}
        </p>
        {notificacion.fecha && (
          <span className="text-muted-foreground shrink-0 text-xs">
            {notificacion.fecha}
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-sm">{notificacion.detalle}</p>
      {!notificacion.leida && (
        <div>
          <Button
            variante="fantasma"
            tamano="sm"
            data-marcar={notificacion.id}
            onClick={() => onMarcar(notificacion.id)}
          >
            {t("notificaciones.marcarLeida")}
          </Button>
        </div>
      )}
    </li>
  );
}

export function Campana({ notificaciones }: Props) {
  // Las que acaban de marcarse en este navegador: se ven leídas al momento, sin esperar a
  // que la acción revalide el layout. Si la acción falla, se devuelven a no leídas.
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [, iniciarTransicion] = useTransition();
  // El anuncio para lectores de pantalla: `n` sube con cada uno, y es la `key` del texto, para
  // que un segundo fallo idéntico cambie el nodo y se vuelva a leer (T-015, R3).
  const [anuncio, setAnuncio] = useState<{ n: number; texto: string } | null>(
    null,
  );
  // Adónde va el foco tras el próximo commit (T-015, R4). `n` permite repetirlo tras revertir.
  const [destinoFoco, setDestinoFoco] = useState<{
    a: string;
    n: number;
  } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  const efectivas = notificaciones.map((n) =>
    marcadas.includes(n.id) ? { ...n, leida: true } : n,
  );
  // Estable: dentro de cada grupo se respeta el orden que llega del servidor.
  const ordenadas = [
    ...efectivas.filter((n) => !n.leida),
    ...efectivas.filter((n) => n.leida),
  ];
  const sinLeer = efectivas.filter((n) => !n.leida).length;

  // El botón pulsado desaparece con la notificación: sin esto el foco cae a `body`. Va al botón
  // de la siguiente sin leer (o la anterior, si era la última) y, si no queda ninguna, al panel.
  // Si tras un fallo el orden se recompone y el foco se pierde, vuelve al mismo destino; si
  // quien usa el panel ya lo ha movido dentro, no se le quita.
  useLayoutEffect(() => {
    if (!destinoFoco) return;
    const panel = raiz.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (!panel) return;
    const activo = document.activeElement;
    if (activo && activo !== document.body && panel.contains(activo)) return;
    const boton =
      destinoFoco.a === "panel"
        ? null
        : panel.querySelector<HTMLElement>(
            `[data-marcar="${CSS.escape(destinoFoco.a)}"]`,
          );
    (boton ?? panel).focus();
  }, [destinoFoco]);

  function anunciar(texto: string) {
    setAnuncio((previo) => ({ n: (previo?.n ?? 0) + 1, texto }));
  }

  function irA(destino: string) {
    setDestinoFoco((previo) => ({ a: destino, n: (previo?.n ?? 0) + 1 }));
  }

  /** Una llamada a una acción que nunca rechaza hacia React (R3): un fallo es `ok: false`. */
  async function llamar(
    accion: () => PromesaOk,
  ): Promise<boolean> {
    try {
      return (await accion()).ok;
    } catch (error) {
      // Una sesión caducada lleva a /login: eso no es un fallo que anunciar.
      unstable_rethrow(error);
      console.error("Campana: la acción ha fallado", error);
      return false;
    }
  }

  function marcar(id: string) {
    const sinLeerAhora = ordenadas.filter((n) => !n.leida).map((n) => n.id);
    const posicion = sinLeerAhora.indexOf(id);
    const destino = sinLeerAhora[posicion + 1] ?? sinLeerAhora[posicion - 1];
    setMarcadas((previas) => [...previas, id]);
    irA(destino ?? "panel");
    iniciarTransicion(async () => {
      const ok = await llamar(() => marcarNotificacionLeida(id));
      if (ok) {
        anunciar(t("notificaciones.marcadaLeida"));
      } else {
        setMarcadas((previas) => previas.filter((x) => x !== id));
        anunciar(t("notificaciones.errorMarcar"));
        if (destino) irA(destino);
      }
    });
  }

  function marcarTodas() {
    const ids = efectivas.filter((n) => !n.leida).map((n) => n.id);
    setMarcadas((previas) => [...previas, ...ids]);
    irA("panel");
    iniciarTransicion(async () => {
      const ok = await llamar(() => marcarTodasLeidas());
      if (ok) {
        anunciar(t("notificaciones.todasMarcadas"));
      } else {
        setMarcadas((previas) => previas.filter((x) => !ids.includes(x)));
        anunciar(t("notificaciones.errorMarcarTodas"));
      }
    });
  }

  const etiqueta =
    sinLeer > 0
      ? tCon("notificaciones.boton.sinLeer", { n: sinLeer })
      : t("notificaciones.boton.todas");

  return (
    <>
      {/* Siempre montado y fuera del `Emergente`: un live region que nace con el contenido no se
        anuncia, y el panel puede cerrarse antes de que la acción termine. Nunca `role="alert"`. */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        <span key={anuncio?.n ?? 0}>{anuncio?.texto}</span>
      </p>
      {/* El panel se ancla por la derecha: la campana está en el borde derecho de la cabecera y a
        360 px un panel anclado por la izquierda se saldría de la pantalla. */}
      <div
        ref={raiz}
        className="[&_[role=dialog]]:right-0 [&_[role=dialog]]:left-auto"
      >
        <Emergente
          titulo={t("notificaciones.titulo")}
          etiqueta={etiqueta}
          disparador={
            <>
              <Bell aria-hidden="true" className="size-4" />
              {sinLeer > 0 && (
                <span aria-hidden="true" className="text-xs font-semibold">
                  {sinLeer}
                </span>
              )}
            </>
          }
        >
          {ordenadas.length === 0 ? (
            <p className="text-muted-foreground">{t("notificaciones.vacio")}</p>
          ) : (
            <>
              {sinLeer > 0 && (
                <div className="mb-3">
                  <Button variante="contorno" tamano="sm" onClick={marcarTodas}>
                    {t("notificaciones.marcarTodas")}
                  </Button>
                </div>
              )}
              <ul className="max-h-80 overflow-y-auto">
                {ordenadas.map((n) => (
                  <ElementoNotificacion
                    key={n.id}
                    notificacion={n}
                    onMarcar={marcar}
                  />
                ))}
              </ul>
            </>
          )}
        </Emergente>
      </div>
    </>
  );
}
