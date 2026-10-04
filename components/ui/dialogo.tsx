'use client';

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { enfocables, useCierreExterior, useDevolucionDeFoco, useFocoAtrapado } from './foco';

type Props = {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  /**
   * Dónde cae el foco al abrir, si no en el primer enfocable (que es la «X»). T-014: el
   * diálogo de mover una cita de serie empieza en «Mantener».
   */
  focoInicial?: RefObject<HTMLElement | null>;
  /** `amplio` es para un formulario entero (T-028): más ancho y, si no cabe, se desplaza por dentro. */
  ancho?: 'normal' | 'amplio';
  children: ReactNode;
};

export function Dialogo({ abierto, alCerrar, titulo, focoInicial, ancho = 'normal', children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const idTitulo = useId();

  useDevolucionDeFoco(abierto);
  useFocoAtrapado(panel, abierto);
  useCierreExterior(panel, abierto, alCerrar);

  // El foco entra al abrir. Al primer elemento enfocable del panel, no al panel: un
  // contenedor enfocado no dice nada al lector de pantalla sobre qué se puede hacer.
  useEffect(() => {
    if (!abierto) return;
    const contenedor = panel.current;
    if (!contenedor) return;
    const elegido = focoInicial?.current;
    if (elegido?.isConnected && contenedor.contains(elegido)) {
      elegido.focus();
      return;
    }
    (enfocables(contenedor)[0] ?? contenedor).focus();
  }, [abierto, focoInicial]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={cn(
          'relative w-full rounded-xl border border-border bg-card p-6',
          'text-card-foreground shadow-lg outline-none',
          ancho === 'amplio' ? 'max-h-[calc(100dvh-2rem)] max-w-5xl overflow-y-auto' : 'max-w-lg',
        )}
      >
        <h2 id={idTitulo} className="pr-12 font-serif text-lg">
          {titulo}
        </h2>

        <button
          type="button"
          onClick={alCerrar}
          aria-label={t('interfaz.cerrar')}
          className={cn(
            'absolute top-3 right-3 inline-flex min-h-11 min-w-11 items-center justify-center',
            'rounded-lg text-muted-foreground transition-colors',
            'hover:bg-muted hover:text-foreground motion-reduce:transition-none',
            'focus-visible:ring-ring/50 outline-none focus-visible:ring-2',
          )}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
