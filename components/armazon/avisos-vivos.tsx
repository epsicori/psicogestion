'use client';

import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { combinarAvisos, esquemaDatosAvisos, type DatosAvisos } from '@/lib/agenda/avisos';

import { AvisoNotas } from './aviso-notas';
import { AnclaSesion, FranjaSesion } from './aviso-sesion';
import { Campana } from './campana';

/**
 * Los avisos al día (T-015, R2). El layout del armazón no se repinta al navegar, así que sin
 * esto la franja de sesión en curso, el recuento y la campana se quedarían con la foto del
 * primer pintado. Aquí se pide `GET /api/avisos` cuando el usuario **hace algo**: cambia de
 * ruta o vuelve a la pestaña.
 *
 * **Nunca con un temporizador de red** (decisión del propietario, R0.8): la sesión caduca a
 * los 30 minutos de inactividad y un sondeo la mantendría viva para siempre. El único
 * temporizador de este fichero es el de `useInstante` (aviso-sesion.tsx), que no toca la red.
 *
 * - Como mucho una petición cada `REFRESCO_MINIMO_MS` y nunca dos a la vez.
 * - Se acepta la respuesta solo si es `200`, `application/json` y cumple el esquema. Una
 *   redirección del proxy (`redirect: 'manual'` la deja opaca), un 401, un 503 o una página
 *   HTML se ignoran en silencio: se conserva lo que había.
 * - Gana siempre la foto con el `ahoraServidor` más reciente (`combinarAvisos`).
 */

export const REFRESCO_MINIMO_MS = 30_000;

type Contexto = { fresco: DatosAvisos | null; refrescar: () => void };

const ContextoAvisosVivos = createContext<Contexto>({ fresco: null, refrescar: () => {} });

async function pedirAvisos(senal: AbortSignal): Promise<DatosAvisos | null> {
  const res = await fetch('/api/avisos', {
    cache: 'no-store',
    redirect: 'manual',
    headers: { accept: 'application/json' },
    signal: senal,
  });
  if (res.type === 'opaqueredirect' || res.status !== 200) return null;
  if (!(res.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return null;
  const analizado = esquemaDatosAvisos.safeParse(await res.json());
  return analizado.success ? analizado.data : null;
}

export function ProveedorAvisosVivos({ children }: { children: ReactNode }) {
  const [fresco, setFresco] = useState<DatosAvisos | null>(null);
  const ultimaPeticion = useRef<number | null>(null);
  const enCurso = useRef<AbortController | null>(null);

  const refrescar = useCallback(() => {
    if (enCurso.current) return;
    if (document.visibilityState === 'hidden') return;
    const ahora = performance.now();
    if (ultimaPeticion.current !== null && ahora - ultimaPeticion.current < REFRESCO_MINIMO_MS) return;

    ultimaPeticion.current = ahora;
    const controlador = new AbortController();
    enCurso.current = controlador;
    pedirAvisos(controlador.signal)
      .then((datos) => {
        if (!datos || controlador.signal.aborted) return;
        setFresco((previo) => (previo ? combinarAvisos(previo, datos) : datos));
      })
      .catch(() => {
        // Sin red, abortada o ilegible: se conserva lo que había.
      })
      .finally(() => {
        if (enCurso.current === controlador) enCurso.current = null;
      });
  }, []);

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') refrescar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      enCurso.current?.abort();
      enCurso.current = null;
    };
  }, [refrescar]);

  const valor = useMemo(() => ({ fresco, refrescar }), [fresco, refrescar]);
  return <ContextoAvisosVivos.Provider value={valor}>{children}</ContextoAvisosVivos.Provider>;
}

/**
 * Pide el refresco al cambiar la ruta (no al montar: el primer pintado ya es reciente).
 * `usePathname` exige `<Suspense>` con Cache Components: el llamador lo pone.
 */
export function RefrescoPorNavegacion() {
  const ruta = usePathname();
  const { refrescar } = useContext(ContextoAvisosVivos);
  const anterior = useRef(ruta);

  useEffect(() => {
    if (anterior.current === ruta) return;
    anterior.current = ruta;
    refrescar();
  }, [ruta, refrescar]);

  return null;
}

function useDatos(inicial: DatosAvisos): DatosAvisos {
  const { fresco } = useContext(ContextoAvisosVivos);
  return combinarAvisos(inicial, fresco);
}

export function AnclaSesionViva({ inicial }: { inicial: DatosAvisos }) {
  const datos = useDatos(inicial);
  return <AnclaSesion ahoraServidor={datos.ahoraServidor} sesiones={datos.sesiones} />;
}

export function FranjaSesionViva({ inicial }: { inicial: DatosAvisos }) {
  const datos = useDatos(inicial);
  return (
    <FranjaSesion
      ahoraServidor={datos.ahoraServidor}
      sesiones={datos.sesiones}
      descartadas={datos.descartadas}
    />
  );
}

export function AvisoNotasVivo({ inicial }: { inicial: DatosAvisos }) {
  return <AvisoNotas recuento={useDatos(inicial).recuento} />;
}

export function CampanaViva({ inicial }: { inicial: DatosAvisos }) {
  return <Campana notificaciones={useDatos(inicial).notificaciones} />;
}
