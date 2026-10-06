'use client';

import { unstable_rethrow } from 'next/navigation';
import {
  createContext,
  useCallback,
  useActionState,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { t, tCon } from '@/lib/i18n';

import { resolverAlerta, type EstadoResolver } from './acciones-alertas';
import { idEnlacePaciente, type Prefijo } from './pendientes-ids';

/**
 * «Marcar como resuelta» de una alerta de documentación (T-015, decisión P1). Quien la pinta ya
 * ha comprobado `puedeResolverAlerta`. Sin confirmación: resolver no borra nada y queda auditado.
 *
 * Tres cosas que se pagaron en la ronda 2:
 * - Ninguna llamada rechaza hacia React (R3): un fallo de red es un `ok: false` más, y se anuncia.
 *   Una redirección de Next (sesión caducada) sí sigue su camino: `unstable_rethrow`.
 * - Mientras se envía, el botón es `aria-disabled` y no `disabled`: un botón `disabled` pierde el
 *   foco, y con él quien navega con teclado o lector de pantalla (R4).
 * - Al acertar, la fila se va con la revalidación: el foco lo decide el bloque y el anuncio vive en
 *   la memoria (`MemoriaResolucion`), que sobrevive a la redirección de página (T-048, ronda 3).
 *
 * El error va en un `role="status"` propio y no en `AvisoDeError`, que lleva `role="alert"`: un
 * fallo al marcar no interrumpe a nadie.
 */

type Resolucion = { alertaId: string; pacienteId: string };
type Contexto = { alResolver: (r: Resolucion) => void };
const ContextoResolucion = createContext<Contexto | null>(null);

/** Lo que el proveedor necesita saber de lo pintado: quién está, en qué orden y con qué alertas. */
export type PacienteEnFoco = { id: string; alertas: readonly string[]; anuncio: string };

/** Una resolución acertada que aún espera a que su alerta deje de estar pintada. */
export type Pendiente = Resolucion & {
  /** El bloque donde se resolvió: el `indice` solo significa algo en esa lista. */
  prefijo: Prefijo;
  /** Su posición en lo pintado al acertar (>= 0). */
  indice: number;
  eraUltimo: boolean;
};

/**
 * Dónde queda el foco y qué se anuncia, o `null` si la alerta sigue pintada (esperar). Puro. El
 * orden de las reglas es parte del contrato (T-048, ronda 3):
 * 1. la alerta sigue → esperar; 2. el paciente sigue → su enlace (con el prefijo del bloque);
 * 3. lista vacía → el encabezado; 4. la resolución es de otro bloque (búsqueda → lista tras una
 * redirección) → el encabezado, porque su índice no señala nada aquí; 5. el vecino de su sitio, o
 * el último si lo era.
 */
export function decidirDestino(
  p: Pendiente,
  bloque: { prefijo: Prefijo; encabezadoId: string; pacientes: readonly PacienteEnFoco[] },
): { id: string; texto: string } | null {
  const { pacientes } = bloque;
  if (pacientes.some((x) => x.alertas.includes(p.alertaId))) return null;
  const base = t('agenda.documentacion.resuelta');
  const paciente = pacientes.find((x) => x.id === p.pacienteId);
  if (paciente) return { id: idEnlacePaciente(bloque.prefijo, paciente.id), texto: `${base} ${paciente.anuncio}` };
  if (pacientes.length === 0) return { id: bloque.encabezadoId, texto: base };
  if (p.prefijo !== bloque.prefijo) return { id: bloque.encabezadoId, texto: base };
  const vecino = p.eraUltimo ? pacientes[pacientes.length - 1] : pacientes[Math.min(p.indice, pacientes.length - 1)];
  return { id: idEnlacePaciente(bloque.prefijo, vecino.id), texto: base };
}

type Memoria = {
  pendiente: Pendiente | null;
  anotar: (p: Pendiente) => void;
  cerrar: (p: Pendiente, texto: string) => void;
  descartar: () => void;
};
/** Exportado solo para la prueba de `cerrar`; nadie más lo lee. */
export const ContextoMemoria = createContext<Memoria | null>(null);

/**
 * La memoria de la resolución: el pendiente y la única región `role="status"` del bloque. En la
 * página vive en `documentacion/layout.tsx`, por encima del límite de redirección de Next y de la
 * `key` del buscador, que remontan la página entera (R2-H1): lo que cruza ese remontaje es esto.
 * El panel de /agenda, que no tiene layout propio, se crea la suya en `ProveedorResolucion`.
 *
 * La región siempre está montada: un live region que nace con el contenido no se anuncia.
 */
export function MemoriaResolucion({ children }: { children: ReactNode }) {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [anuncio, setAnuncio] = useState({ texto: '', n: 0 });
  const ultimoCerrado = useRef<Pendiente | null>(null);

  const anotar = useCallback((p: Pendiente) => setPendiente(p), []);
  const descartar = useCallback(() => setPendiente(null), []);
  // Idempotente por identidad: StrictMode repite el efecto que llama aquí y el anuncio saltaría dos veces.
  const cerrar = useCallback((p: Pendiente, texto: string) => {
    if (ultimoCerrado.current === p) return;
    ultimoCerrado.current = p;
    setPendiente(null);
    setAnuncio((previo) => ({ texto, n: previo.n + 1 }));
  }, []);

  // Activity oculta la ruta con su estado al salir de ella: se tira el pendiente, y al volver nada
  // roba el foco (preserving-ui-state.md).
  useLayoutEffect(() => () => descartar(), [descartar]);

  const valor = useMemo(() => ({ pendiente, anotar, cerrar, descartar }), [pendiente, anotar, cerrar, descartar]);

  return (
    <ContextoMemoria.Provider value={valor}>
      {children}
      <p role="status" aria-live="polite" aria-atomic="true" data-estado-bloque className="sr-only">
        <span key={anuncio.n}>{anuncio.texto || null}</span>
      </p>
    </ContextoMemoria.Provider>
  );
}

const NADA = () => {};

/** Tira la resolución pendiente (nueva búsqueda, «Limpiar búsqueda»). Sin memoria, no hace nada. */
export function useDescartarResolucion(): () => void {
  return useContext(ContextoMemoria)?.descartar ?? NADA;
}

type PropiedadesBloque = {
  prefijo: Prefijo;
  encabezadoId: string;
  pacientes: readonly PacienteEnFoco[];
  alAcertar?: () => void;
  children: ReactNode;
};

/**
 * El contenedor del bloque de alertas: decide dónde queda el foco tras resolver. Lo pintan el panel
 * y la página dentro de su marco y en todas las ramas (lista, vacío y error), para que no pierda el
 * estado cuando la última alerta pasa a «vacío» (T-015, R4).
 *
 * El foco no se decide al acertar sino cuando la alerta resuelta **deja de estar en lo pintado**
 * (`pacientes`): hasta entonces la revalidación no ha llegado y el destino sería el de antes (T-048).
 * Se decide en un efecto, tras el commit, cuando los `id` de destino ya existen.
 */
export function ProveedorResolucion(props: PropiedadesBloque) {
  const memoria = useContext(ContextoMemoria);
  if (memoria) return <BloqueResolucion {...props} />;
  return (
    <MemoriaResolucion>
      <BloqueResolucion {...props} />
    </MemoriaResolucion>
  );
}

function BloqueResolucion({ prefijo, encabezadoId, pacientes, alAcertar, children }: PropiedadesBloque) {
  const { pendiente, anotar, cerrar } = useContext(ContextoMemoria)!;
  // Lo pintado «ahora», para que `alResolver` calcule el sitio del paciente aunque la acción de
  // `useActionState` lo llame con el cierre de un render anterior.
  const pacientesAhora = useRef(pacientes);
  useEffect(() => {
    pacientesAhora.current = pacientes;
  }, [pacientes]);

  useEffect(() => {
    if (!pendiente) return;
    const destino = decidirDestino(pendiente, { prefijo, encabezadoId, pacientes });
    if (!destino) return;
    document.getElementById(destino.id)?.focus();
    cerrar(pendiente, destino.texto);
  }, [pendiente, pacientes, prefijo, encabezadoId, cerrar]);

  const alResolver = useCallback(
    (r: Resolucion) => {
      const lista = pacientesAhora.current;
      const indice = lista.findIndex((p) => p.id === r.pacienteId);
      anotar({ ...r, prefijo, indice: Math.max(indice, 0), eraUltimo: indice === lista.length - 1 });
      alAcertar?.();
    },
    [alAcertar, anotar, prefijo],
  );

  return (
    <ContextoResolucion.Provider value={{ alResolver }}>
      <div data-bloque-pendientes>{children}</div>
    </ContextoResolucion.Provider>
  );
}

type Resultado = { resultado: EstadoResolver; intento: number };

export function ResolverAlerta({
  alertaId,
  pacienteId,
  etiquetaTipo,
}: {
  alertaId: string;
  pacienteId: string;
  etiquetaTipo: string;
}) {
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
      if (resultado?.ok) bloque?.alResolver({ alertaId, pacienteId });
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

