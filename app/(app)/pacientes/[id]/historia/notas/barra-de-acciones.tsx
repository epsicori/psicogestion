'use client';

import { useLayoutEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/**
 * La barra del pulgar (ADR-044): pegada abajo, por encima de la zona segura del dispositivo.
 * Solo pinta lo que tiene una acción real detrás: sin Comparar ni Descargar hasta el corte C.
 * Quien no puede escribir (no es el autor) recibe los tres en `false` y la barra queda vacía.
 *
 * Con el teclado virtual abierto (`resizes-content`) la barra sticky tapaba la línea del cursor:
 * el navegador solo asegura que el cursor esté dentro de la ventana, no por encima de la barra.
 * Mientras la barra existe, su alto va a `scroll-padding-bottom` del documento, que es el que
 * respeta al llevar el cursor a la vista (criterio 10).
 */
export function BarraDeAcciones({
  puedeGuardar,
  puedeFirmar,
  puedeModificar,
  pendiente,
  alGuardar,
  alFirmar,
  alModificar,
}: {
  puedeGuardar: boolean;
  puedeFirmar: boolean;
  puedeModificar: boolean;
  pendiente: boolean;
  alGuardar: () => void;
  alFirmar: () => void;
  alModificar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const barra = ref.current;
    if (barra === null) return;
    const raiz = document.documentElement;
    const previo = raiz.style.scrollPaddingBottom;
    const reservar = () => {
      raiz.style.scrollPaddingBottom = `${barra.offsetHeight}px`;
    };
    reservar();
    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(reservar) : null;
    observador?.observe(barra);
    return () => {
      observador?.disconnect();
      raiz.style.scrollPaddingBottom = previo;
    };
  }, []);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t('notas.editor.acciones')}
      className="border-border bg-background sticky bottom-0 flex flex-wrap justify-end gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_10px_-6px_rgb(0_0_0/0.14)]"
    >
      {puedeGuardar && (
        <Button variante="contorno" onClick={alGuardar} disabled={pendiente}>
          {t('notas.editor.guardar')}
        </Button>
      )}
      {puedeModificar && (
        <Button variante="contorno" onClick={alModificar} disabled={pendiente}>
          {t('notas.editor.modificar')}
        </Button>
      )}
      {puedeFirmar && (
        <Button onClick={alFirmar} disabled={pendiente} data-accion="firmar">
          {t('notas.editor.firmar')}
        </Button>
      )}
    </div>
  );
}
