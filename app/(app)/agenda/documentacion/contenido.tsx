import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AvisoDeError } from '@/components/ui/piezas';
import { leerNombresPacientes, leerPendientes } from '@/lib/citas/agenda';
import { t, tCon } from '@/lib/i18n';

import { criterioDocumentacion } from '../bloques';
import { cargarContexto } from '../datos';
import { EstadoVacio } from '../estado-vacio';
import {
  agruparYOrdenar,
  hrefDocumentacion,
  paginar,
  presentarGrupo,
  TAMANO_PAGINA,
  tiposConsultados,
  tiposVisibles,
  type GrupoPresentado,
} from '../pendientes';
import { FilaPaciente } from '../pendientes-fila';
import { ProveedorResolucion, type PacienteEnFoco } from '../resolver-alerta';
import { Buscador } from './buscador';
import { Filtros } from './filtros';
import { Paginacion } from './paginacion';
import { ID_TITULO, leerParametrosDocumentacion } from './parametros';

const ENLACE =
  'focus-visible:ring-ring/50 inline-flex min-h-11 items-center self-start text-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2';

export function enFoco(grupos: readonly GrupoPresentado[]): PacienteEnFoco[] {
  return grupos.map((g) => ({ id: g.pacienteId, alertas: g.pendientes.map((p) => p.id), anuncio: g.anuncio }));
}

/**
 * El envoltorio de la lista: siempre en la misma posición del árbol y con su `status` montado, en
 * la lista, en el vacío y en el error, para que el foco y el aviso de «resuelta» sobrevivan a que
 * la última alerta pase a «vacío» (T-015, R4).
 */
function Lista({ pacientes = [], children }: { pacientes?: readonly PacienteEnFoco[]; children: ReactNode }) {
  return (
    <ProveedorResolucion prefijo="pagina" encabezadoId={ID_TITULO} pacientes={pacientes}>
      {children}
    </ProveedorResolucion>
  );
}

/**
 * Todos los pendientes que ve quien mira, agrupados por paciente y paginados de veinte en veinte
 * (T-048). Los filtros y la página viven en la URL; el término de búsqueda, no.
 */
export async function ContenidoDocumentacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = leerParametrosDocumentacion(await searchParams);

  const contexto = await cargarContexto(null);
  if (!contexto.ok)
    return (
      <Lista>
        <AvisoDeError mensaje={contexto.mensaje} />
      </Lista>
    );

  const criterio = criterioDocumentacion(contexto.rol);
  const visibles = tiposVisibles(criterio);
  const tipos = tiposConsultados(criterio, p.tipo);
  const r = await leerPendientes(contexto.sesion, {
    soloPropias: criterio.soloPropias,
    tipos,
    nivel: p.nivel ?? undefined,
    pacienteId: p.paciente ?? undefined,
  });
  if (!r.ok)
    return (
      <Lista>
        <AvisoDeError mensaje={r.mensaje} />
      </Lista>
    );

  const grupos = agruparYOrdenar(r.alertas);
  const pag = paginar(grupos, p.pagina, TAMANO_PAGINA);
  // Fuera de rango (un borrado, un filtro nuevo): a la última página existente. Sin `try`.
  if (p.pagina > pag.ultima)
    redirect(hrefDocumentacion({ tipo: p.tipo, nivel: p.nivel, paciente: p.paciente, pagina: pag.ultima }));

  const n = await leerNombresPacientes(
    contexto.sesion,
    pag.items.map((g) => g.pacienteId),
  );
  if (!n.ok)
    return (
      <Lista>
        <AvisoDeError mensaje={n.mensaje} />
      </Lista>
    );

  const modo = p.paciente ? 'completo' : 'desplegable';
  const presentados = pag.items.map((g) => {
    const fila = n.nombres.get(g.pacienteId);
    const nombre = [fila?.nombre, fila?.apellidos].filter(Boolean).join(' ');
    return presentarGrupo(g, { rol: contexto.rol, hoy: contexto.hoy, nombre: nombre === '' ? null : nombre, modo, filtros: p });
  });

  const hayFiltros = p.tipo !== null || p.nivel !== null || p.paciente !== null;
  const lista =
    presentados.length === 0 ? (
      <Lista>
        {hayFiltros ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm font-medium">{t('agenda.documentacion.pagina.vacioFiltros')}</p>
            <Link href="/agenda/documentacion" className={ENLACE}>
              {t('agenda.documentacion.pagina.quitarFiltros')}
            </Link>
          </div>
        ) : (
          <EstadoVacio
            icono="documento"
            titulo={t('agenda.documentacion.vacio')}
            explicacion={t('agenda.documentacion.vacioExplicacion')}
          />
        )}
      </Lista>
    ) : (
      <Lista pacientes={enFoco(presentados)}>
        <ul className="divide-border flex flex-col divide-y">
          {presentados.map((g) => (
            <li key={g.pacienteId}>
              <FilaPaciente grupo={g} prefijo="pagina" modo={modo} />
            </li>
          ))}
        </ul>
        {!p.paciente && <Paginacion pagina={pag.pagina} ultima={pag.ultima} filtros={p} />}
      </Lista>
    );

  return (
    <div className="flex flex-col gap-4">
      {r.recortada && (
        <p className="text-muted-foreground text-xs">
          {tCon('agenda.documentacion.recorte', { leidos: r.alertas.length, total: r.total })}
        </p>
      )}
      <Filtros visibles={visibles} vigentes={p} />
      {p.paciente && (
        <Link href={hrefDocumentacion({ tipo: p.tipo, nivel: p.nivel })} className={ENLACE}>
          {t('agenda.documentacion.pagina.quitarPaciente')}
        </Link>
      )}
      {p.paciente ? lista : <Buscador tipo={p.tipo} nivel={p.nivel}>{lista}</Buscador>}
    </div>
  );
}
