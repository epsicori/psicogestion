'use client';

import { unstable_rethrow } from 'next/navigation';
import {
  createContext,
  useCallback,
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
 * - Al acertar, la fila se va con la revalidación: el foco y el anuncio viven en el bloque, que
 *   no se desmonta (`ProveedorResolucion`).
 *
 * El error va en un `role="status"` propio y no en `AvisoDeError`, que lleva `role="alert"`: un
 * fallo al marcar no interrumpe a nadie.
 */

type Resolucion = { alertaId: string; pacienteId: string };
type Contexto = { alResolver: (r: Resolucion) => void };
const ContextoResolucion = createContext<Contexto | null>(null);

/** Lo que el proveedor necesita saber de lo pintado: quién está, en qué orden y con qué alertas. */
export type PacienteEnFoco = { id: string; alertas: readonly string[]; anuncio: string };

type Pendiente = Resolucion & { indice: number; eraUltimo: boolean };

/**
 * El contenedor del bloque de alertas: decide dónde queda el foco tras resolver y anuncia que se
 * resolvió. Lo pintan el panel y la página dentro de su marco y en todas las ramas (lista, vacío y
 * error), para que no pierda el estado cuando la última alerta pasa a «vacío» (T-015, R4).
 *
 * El foco no se decide al acertar sino cuando la alerta resuelta **deja de estar en lo pintado**
 * (`pacientes`): hasta entonces la revalidación no ha llegado y el destino sería el de antes (T-048).
 * Si el paciente sigue, su enlace; si no, el que ocupa su sitio (o el anterior, si era el último);
 * si no queda ninguno, el encabezado del bloque.
 */
export function ProveedorResolucion({
  prefijo,
  encabezadoId,
  pacientes,
  alAcertar,
  children,
}: {
  prefijo: Prefijo;
  encabezadoId: string;
  pacientes: readonly PacienteEnFoco[];
  alAcertar?: () => void;
  children: ReactNode;
}) {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [anuncio, setAnuncio] = useState({ texto: '', n: 0 });
  const [enfocar, setEnfocar] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });
  // Lo pintado «ahora», para que `alResolver` calcule el sitio del paciente aunque la acción de
  // `useActionState` lo llame con el cierre de un render anterior.
  const pacientesAhora = useRef(pacientes);
  useEffect(() => {
    pacientesAhora.current = pacientes;
  }, [pacientes]);

  // La alerta resuelta ya no está en lo pintado (la revalidación o la nueva búsqueda ha llegado):
  // se decide el destino y el aviso. Es estado propio ajustado durante el render, sin efecto; lo
  // único que queda al efecto es tocar el DOM.
  if (pendiente && !pacientes.some((p) => p.alertas.includes(pendiente.alertaId))) {
    const paciente = pacientes.find((p) => p.id === pendiente.pacienteId);
    let destino = encabezadoId;
    let texto = t('agenda.documentacion.resuelta');
    if (paciente) {
      destino = idEnlacePaciente(prefijo, paciente.id);
      texto = `${texto} ${paciente.anuncio}`;
    } else if (pacientes.length > 0) {
      const vecino = pendiente.eraUltimo
        ? pacientes[pacientes.length - 1]
        : pacientes[Math.min(pendiente.indice, pacientes.length - 1)];
      destino = idEnlacePaciente(prefijo, vecino.id);
    }
    setPendiente(null);
    setAnuncio((previo) => ({ texto, n: previo.n + 1 }));
    setEnfocar((previo) => ({ id: destino, n: previo.n + 1 }));
  }

  useEffect(() => {
    if (enfocar.id) document.getElementById(enfocar.id)?.focus();
  }, [enfocar]);

  const alResolver = useCallback(
    (r: Resolucion) => {
      const lista = pacientesAhora.current;
      const indice = lista.findIndex((p) => p.id === r.pacienteId);
      setPendiente({ ...r, indice: Math.max(indice, 0), eraUltimo: indice === lista.length - 1 });
      alAcertar?.();
    },
    [alAcertar],
  );

  return (
    <ContextoResolucion.Provider value={{ alResolver }}>
      <div data-bloque-pendientes>
        {children}
        {/* Siempre montado: un live region que nace con el contenido no se anuncia. */}
        <p role="status" aria-live="polite" aria-atomic="true" data-estado-bloque className="sr-only">
          <span key={anuncio.n}>{anuncio.texto || null}</span>
        </p>
      </div>
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
