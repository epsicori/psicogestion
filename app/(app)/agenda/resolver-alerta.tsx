'use client';

import { unstable_rethrow } from 'next/navigation';
import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { t, tCon } from '@/lib/i18n';

import { resolverAlerta, type EstadoResolver } from './acciones-alertas';

/**
 * «Marcar como resuelta» de una alerta de documentación (T-015, decisión P1). Quien la pinta ya
 * ha comprobado `puedeResolverAlerta`. Sin confirmación: resolver no borra nada y queda auditado.
 *
 * Tres cosas que se pagaron en la ronda 2:
 * - Ninguna llamada rechaza hacia React (R3): un fallo de red es un `ok: false` más, y se anuncia.
 *   Una redirección de Next (sesión caducada) sí sigue su camino: `unstable_rethrow`.
 * - Mientras se envía, el botón es `aria-disabled` y no `disabled`: un botón `disabled` pierde el
 *   foco, y con él quien navega con teclado o lector de pantalla (R4).
 * - Al acertar, la fila se va con la revalidación: el foco y el anuncio viven en el bloque, que
 *   no se desmonta (`ProveedorResolucion`).
 *
 * El error va en un `role="status"` propio y no en `AvisoDeError`, que lleva `role="alert"`: un
 * fallo al marcar no interrumpe a nadie.
 */

type Contexto = { alResolver: () => void };
const ContextoResolucion = createContext<Contexto | null>(null);

/**
 * El contenedor del bloque de alertas: lo enfocable tras resolver y el aviso de que se resolvió.
 * Lo pinta `Marco` dentro de `MarcoBloque` y en todas las ramas (lista, vacío y error), para que
 * no pierda el estado cuando la última alerta pasa a «vacío».
 */
export function ProveedorResolucion({ children }: { children: ReactNode }) {
  const [resueltas, setResueltas] = useState(0);
  const grupo = useRef<HTMLDivElement>(null);

  // El foco, tras el commit en que ya consta el éxito: da igual si la fila ya se ha ido o no,
  // el contenedor no se desmonta.
  useEffect(() => {
    if (resueltas > 0) grupo.current?.focus();
  }, [resueltas]);

  return (
    <ContextoResolucion.Provider value={{ alResolver: () => setResueltas((n) => n + 1) }}>
      <div ref={grupo} role="group" aria-labelledby="agenda-documentacion" tabIndex={-1} className="outline-none">
        {children}
        {/* Siempre montado: un live region que nace con el contenido no se anuncia. */}
        <p role="status" aria-live="polite" aria-atomic="true" data-estado-bloque className="sr-only">
          <span key={resueltas}>{resueltas > 0 ? t('agenda.documentacion.resuelta') : null}</span>
        </p>
      </div>
    </ContextoResolucion.Provider>
  );
}

type Resultado = { resultado: EstadoResolver; intento: number };

export function ResolverAlerta({ alertaId, etiquetaTipo }: { alertaId: string; etiquetaTipo: string }) {
  const bloque = useContext(ContextoResolucion);

  const [estado, accion, pendiente] = useActionState<Resultado, FormData>(
    async (previo, datos) => {
      let resultado: EstadoResolver;
      try {
        resultado = await resolverAlerta(null, datos);
      } catch (error) {
        unstable_rethrow(error);
        console.error('ResolverAlerta: la acción ha fallado', error);
        resultado = { ok: false, error: 'fallo' };
      }
      if (resultado?.ok) bloque?.alResolver();
      return { resultado, intento: previo.intento + 1 };
    },
    { resultado: null, intento: 0 },
  );
  const fallo = estado.resultado !== null && !estado.resultado.ok;

  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="alertaId" value={alertaId} />
      <Button
        type="submit"
        variante="secundario"
        tamano="sm"
        aria-disabled={pendiente}
        onClick={(e) => {
          // `aria-disabled` no impide el clic: un segundo Intro o clic no envía dos veces.
          if (pendiente) e.preventDefault();
        }}
        aria-label={pendiente ? undefined : tCon('agenda.documentacion.resolverEtiqueta', { tipo: etiquetaTipo })}
      >
        {pendiente ? t('agenda.documentacion.resolviendo') : t('agenda.documentacion.resolver')}
      </Button>
      <p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-destructive">
        <span key={estado.intento}>{fallo ? t('agenda.documentacion.errorResolver') : null}</span>
      </p>
    </form>
  );
}
