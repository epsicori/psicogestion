'use client';

import Link from 'next/link';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from 'react';

import { RUTA_NOTAS_DISPONIBLE, rutaNotas } from '@/app/(app)/agenda/notas';
import { Button } from '@/components/ui/button';
import { proximoCambio, sesionesEnCurso, type SesionPropia } from '@/lib/agenda/avisos';
import { t, tCon } from '@/lib/i18n';

import { descartarFranja } from './acciones-avisos';

/**
 * Aviso de sesión en curso (T-015 §1.6): la franja encima del contenido y el ancla de la
 * cabecera. Son dos nodos del árbol del armazón que comparten una sola cosa, el ancla, para
 * poder llevarle el foco al descartar: eso es el contexto.
 *
 * **Reloj**: el instante es el del servidor más lo que haya pasado en este navegador
 * (`performance.now()`), y un único `setTimeout` hasta el próximo inicio o fin (como mucho un
 * minuto). Nunca el reloj del navegador: el primer pintado es el del servidor y la hidratación
 * coincide.
 *
 * **Foco**: la franja aparece sin tocar el foco. Nada de `autoFocus`, `role="alert"` ni diálogos;
 * el único `focus()` es el del ancla, tras descartar.
 */

const MINUTO = 60_000;

const ContextoAncla = createContext<RefObject<HTMLAnchorElement | null> | null>(null);

export function ProveedorAvisosSesion({ children }: { children: ReactNode }) {
  const ancla = useRef<HTMLAnchorElement | null>(null);
  return <ContextoAncla.Provider value={ancla}>{children}</ContextoAncla.Provider>;
}

/** El instante estimado: el del servidor más el tiempo transcurrido aquí. */
function useInstante(ahoraServidor: string, sesiones: SesionPropia[]): number {
  const base = Date.parse(ahoraServidor);
  const [instante, setInstante] = useState(base);

  useEffect(() => {
    const t0 = performance.now();
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const programar = (actual: number) => {
      const proximo = proximoCambio(sesiones, new Date(actual));
      // +1 ms: el cambio cae justo después del borde, no en él (inicio incluido, fin excluido).
      const espera = proximo === null ? MINUTO : Math.min(proximo.getTime() - actual + 1, MINUTO);
      temporizador = setTimeout(() => {
        const ahora = base + (performance.now() - t0);
        setInstante(ahora);
        programar(ahora);
      }, espera);
    };

    programar(base);
    return () => clearTimeout(temporizador);
  }, [base, sesiones]);

  return instante;
}

type PropsAncla = { ahoraServidor: string; sesiones: SesionPropia[] };

/** En la cabecera, mientras haya una sesión en curso, esté o no descartada la franja. */
export function AnclaSesion({ ahoraServidor, sesiones }: PropsAncla) {
  const ancla = useContext(ContextoAncla);
  const instante = useInstante(ahoraServidor, sesiones);
  const enCurso = sesionesEnCurso(sesiones, new Date(instante));
  if (enCurso.length === 0) return null;

  const primera = enCurso[0];
  const destino = RUTA_NOTAS_DISPONIBLE ? rutaNotas(primera.pacienteId, primera.citaId) : '/agenda';

  return (
    <Link
      ref={ancla}
      href={destino}
      className="focus-visible:ring-ring/50 hover:bg-muted inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-2"
    >
      <span aria-hidden="true" className="bg-primary halo-estado size-2.5 shrink-0 rounded-full" />
      <span className="sr-only sm:not-sr-only">{t('avisos.sesion.ancla')}</span>
      {enCurso.length > 1 && <span className="text-muted-foreground text-xs">{enCurso.length}</span>}
    </Link>
  );
}

type PropsFranja = PropsAncla & { descartadas: string[] };

/** La franja, en el flujo encima del contenido: ni `fixed` ni `sticky` (D9). */
export function FranjaSesion({ ahoraServidor, sesiones, descartadas }: PropsFranja) {
  const ancla = useContext(ContextoAncla);
  const instante = useInstante(ahoraServidor, sesiones);
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [, iniciarTransicion] = useTransition();

  const visibles = sesionesEnCurso(sesiones, new Date(instante)).filter(
    (s) => !descartadas.includes(s.citaId) && !ocultas.includes(s.citaId),
  );
  const sesion = visibles[0];

  function descartar(citaId: string) {
    setOcultas((previas) => (previas.includes(citaId) ? previas : [...previas, citaId]));
    // El botón desaparece con la franja: el foco va al ancla, que sigue en la cabecera.
    ancla?.current?.focus();
    iniciarTransicion(async () => {
      await descartarFranja(citaId);
    });
  }

  return (
    // Siempre montado: un live region que nace con el contenido no se anuncia.
    <div data-franja-sesion role="status" aria-live="polite" aria-atomic="true">
      {sesion && (
        <div
          key={sesion.citaId}
          className="border-border bg-secondary text-secondary-foreground mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-sm motion-safe:transition-opacity motion-safe:duration-300 motion-safe:starting:opacity-0"
        >
          <p className="min-w-0 flex-1 font-medium">
            {tCon('avisos.sesion.franja', {
              paciente: sesion.nombrePaciente,
              desde: sesion.desde,
              hasta: sesion.hasta,
            })}
          </p>
          <div className="flex items-center gap-2">
            {RUTA_NOTAS_DISPONIBLE && (
              <Link
                href={rutaNotas(sesion.pacienteId, sesion.citaId)}
                className="focus-visible:ring-ring/50 bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold outline-none focus-visible:ring-2"
              >
                {t('avisos.sesion.notas')}
              </Link>
            )}
            <Button variante="fantasma" onClick={() => descartar(sesion.citaId)}>
              {t('avisos.sesion.descartar')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
