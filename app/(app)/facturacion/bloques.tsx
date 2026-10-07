import { Clock3, WalletCards } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { iniciales } from '@/components/armazon/modulos';
import {
  AvisoDeError,
  Cargando,
  EstadoVacio,
  FilaConAvatar,
  Metrica,
  Pildora,
  Tarjeta,
} from '@/components/ui/piezas';
import { formatearImporte } from '@/lib/dinero/importe';
import { formatearFechaSinZona } from '@/lib/fechas/relativo';
import { t, tCon } from '@/lib/i18n';

import {
  TAMANO_PAGINA,
  cargarCobrosRecientes,
  cargarContexto,
  cargarPendientes,
  cargarResumen,
  type PendienteConNombre,
} from './datos';
import { pildoraDe } from './presentacion';

/**
 * Los tres bloques de `/facturacion` (T-023 §1.4). Server Components: los importes se formatean
 * aquí y bajan como texto. Cada uno lee el contexto (memoizado por petición) y su consulta; la
 * página los pone cada uno en su `<Suspense>`.
 *
 * **Ninguna fila lleva menú, editar, borrar ni anular**: un cobro no se modifica, se corrige con
 * otro (CLAUDE.md §6).
 */

type ParametrosDeBusqueda = Promise<Record<string, string | string[] | undefined>>;
type Props = { searchParams: ParametrosDeBusqueda };

/** El marco de un bloque: tarjeta y título, el mismo en el bloque y en su esqueleto. */
export function MarcoFacturacion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <Tarjeta className="p-5">
      <section aria-labelledby={id} className="flex flex-col gap-4">
        <h3 id={id} className="font-serif text-lg font-semibold text-foreground">
          {titulo}
        </h3>
        {children}
      </section>
    </Tarjeta>
  );
}

const nombreDe = (fila: { nombre: string; apellidos: string }) => `${fila.nombre} ${fila.apellidos}`.trim();

/** El icono de la métrica en ámbar (el `accent` del tema, como el prototipo). */
const ICONO_AMBAR = (
  <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
    <Clock3 className="size-4" aria-hidden="true" />
  </span>
);

export async function BloqueMetrica({ searchParams }: Props) {
  const { profesionalFiltrado } = await cargarContexto(searchParams);
  // Las cifras salen de la base y cubren todas las filas, no solo la página que se pinta.
  const resultado = await cargarResumen(profesionalFiltrado);
  if (!resultado.ok) return <AvisoDeError mensaje={t('cobros.errorPendientes')} />;

  const { pendienteTotal, conPendiente, deMas } = resultado.resumen;

  return (
    <Tarjeta className="p-5">
      <Metrica
        etiqueta={t('cobros.pendienteDeCobro')}
        valor={formatearImporte(pendienteTotal)}
        matiz={tCon(conPendiente === 1 ? 'cobros.pacientesConPendiente.una' : 'cobros.pacientesConPendiente.varias', {
          n: conPendiente,
        })}
        icono={ICONO_AMBAR}
      />
      {deMas > 0 && (
        <p className="mt-2 text-xs font-medium text-accent-foreground">{tCon('cobros.conCobrosDeMas', { n: deMas })}</p>
      )}
    </Tarjeta>
  );
}

function subtituloDe(fila: PendienteConNombre): string {
  switch (fila.estado) {
    case 'cobrado_de_mas':
      return tCon('cobros.cobradoDeMasRevisa', { importe: formatearImporte(fila.excedente) });
    case 'pendiente':
      return tCon('cobros.debeYHaPagado', {
        debe: formatearImporte(fila.pendiente),
        pagado: formatearImporte(fila.cobrado),
      });
    case 'cobrado':
      return tCon('cobros.alDia', { pagado: formatearImporte(fila.cobrado) });
  }
}

/** `/facturacion` con el filtro de profesional y la página; la 1 va sin `pagina`. */
function hrefDePagina(profesional: string | null, pagina: number): string {
  const parametros = new URLSearchParams();
  if (profesional) parametros.set('profesional', profesional);
  if (pagina > 1) parametros.set('pagina', String(pagina));
  const consulta = parametros.toString();
  return consulta ? `/facturacion?${consulta}` : '/facturacion';
}

const ENLACE_DE_PAGINA =
  'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export async function BloquePendientes({ searchParams }: Props) {
  const { profesionalFiltrado, pagina: paginaPedida } = await cargarContexto(searchParams);
  const resumen = await cargarResumen(profesionalFiltrado);
  if (!resumen.ok) return <AvisoDeError mensaje={t('cobros.errorPendientes')} />;

  // Una página que pasa de la última (?pagina=999999) cae en la última.
  const total = resumen.resumen.filas;
  const ultima = Math.max(1, Math.ceil(total / TAMANO_PAGINA));
  const pagina = Math.min(paginaPedida, ultima);

  const resultado = await cargarPendientes(profesionalFiltrado, pagina);
  if (!resultado.ok) return <AvisoDeError mensaje={t('cobros.errorPendientes')} />;

  if (resultado.filas.length === 0) {
    return (
      <EstadoVacio
        icono={<WalletCards className="size-5" aria-hidden="true" />}
        frase={t('cobros.nadaPendiente')}
        explicacion={t('cobros.nadaPendienteExplicacion')}
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {resultado.filas.map((fila) => {
          const pildora = pildoraDe(fila);
          return (
            <li key={fila.pacienteId} className="flex flex-col gap-1">
              <FilaConAvatar
                iniciales={iniciales(nombreDe(fila))}
                nombre={nombreDe(fila)}
                derecha={<Pildora tono={pildora.tono}>{pildora.texto}</Pildora>}
              />
              {/* B-H7: el importe va en su propia línea, que rompe y no se trunca; `FilaConAvatar` corta. */}
              <p className="ml-12 text-xs break-words text-muted-foreground">{subtituloDe(fila)}</p>
              {fila.citasSinTarifa > 0 && (
                // P3: la sesión sin precio cuenta 0 y se señala, en ámbar, bajo el subtítulo.
                <p className="ml-12 text-xs font-medium text-accent-foreground">
                  {tCon(fila.citasSinTarifa === 1 ? 'cobros.sesionesSinPrecio.una' : 'cobros.sesionesSinPrecio.varias', {
                    n: fila.citasSinTarifa,
                  })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {TAMANO_PAGINA < total && (
        <nav
          aria-label={t('cobros.paginacion.nombre')}
          className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"
        >
          <p className="text-xs text-muted-foreground">
            {tCon('cobros.paginacion.rango', {
              desde: (pagina - 1) * TAMANO_PAGINA + 1,
              hasta: Math.min(pagina * TAMANO_PAGINA, total),
              total,
            })}
          </p>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link href={hrefDePagina(profesionalFiltrado, pagina - 1)} className={ENLACE_DE_PAGINA}>
                {t('cobros.paginacion.anteriores')}
              </Link>
            )}
            {pagina < ultima && (
              <Link href={hrefDePagina(profesionalFiltrado, pagina + 1)} className={ENLACE_DE_PAGINA}>
                {t('cobros.paginacion.siguientes')}
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}

export async function BloqueCobros({ searchParams }: Props) {
  const { profesionalFiltrado, zona } = await cargarContexto(searchParams);
  const resultado = await cargarCobrosRecientes(profesionalFiltrado);
  if (!resultado.ok) return <AvisoDeError mensaje={t('cobros.errorCobros')} />;

  if (resultado.cobros.length === 0) {
    return <EstadoVacio frase={t('cobros.sinCobros')} />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {resultado.cobros.map((cobro) => (
        <li key={cobro.id} className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{nombreDe(cobro)}</p>
            <p className="text-xs text-muted-foreground">
              {`${formatearFechaSinZona(cobro.fecha, zona)} · ${t(`cobros.formas.${cobro.formaPago}`)}`}
            </p>
            {cobro.importe < 0 && cobro.motivo && (
              <p className="text-xs break-words text-muted-foreground">
                {tCon('cobros.devolucionConMotivo', { motivo: cobro.motivo })}
              </p>
            )}
          </div>
          <span className="shrink-0 font-serif text-sm font-medium text-foreground tabular-nums">
            {formatearImporte(cobro.importe)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Esqueletos: la forma del bloque mientras llega, sin saltos al cargar (§7). */
export function EsqueletoMetrica() {
  return (
    <Tarjeta className="p-5">
      <Cargando filas={2} />
    </Tarjeta>
  );
}

export function EsqueletoLista({ filas = 4 }: { filas?: number }) {
  return <Cargando filas={filas} />;
}
