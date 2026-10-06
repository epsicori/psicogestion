import Link from 'next/link';
import type { ReactNode } from 'react';

import { AvisoDeError } from '@/components/ui/piezas';
import { leerNombresPacientes, leerPendientes } from '@/lib/citas/agenda';
import { t, tCon } from '@/lib/i18n';

import { criterioDocumentacion } from './bloques';
import { cargarContexto } from './datos';
import { EstadoVacio } from './estado-vacio';
import { MarcoBloque } from './marco';
import { agruparYOrdenar, presentarGrupo, TAMANO_PANEL, type GrupoPresentado } from './pendientes';
import { FilaPaciente } from './pendientes-fila';
import { ProveedorResolucion, type PacienteEnFoco } from './resolver-alerta';

const ID_TITULO = 'agenda-documentacion';

/** El bloque trae su propio marco, como el cuadro: sin tipos que ver no queda una tarjeta vacía. */
function Marco({ pacientes = [], children }: { pacientes?: readonly PacienteEnFoco[]; children: ReactNode }) {
  return (
    <MarcoBloque id={ID_TITULO} titulo={t('agenda.documentacion.titulo')} encabezadoEnfocable>
      {/* Dentro del marco y en todas las ramas: el foco y el aviso de «resuelta» sobreviven a que
          la última alerta pase a «vacío» (T-015, R4). */}
      <ProveedorResolucion prefijo="panel" encabezadoId={ID_TITULO} pacientes={pacientes}>
        {children}
      </ProveedorResolucion>
    </MarcoBloque>
  );
}

function enFoco(grupos: readonly GrupoPresentado[]): PacienteEnFoco[] {
  return grupos.map((g) => ({
    id: g.pacienteId,
    alertas: g.pendientes.map((p) => p.id),
    anuncio: g.anuncio,
  }));
}

/**
 * La bandeja de documentación abierta que la RLS deja ver (H12), agrupada por paciente y con los
 * seis más urgentes (T-048, D13). Nada clínico: la tabla no lo tiene. No se filtra por centro: lo
 * que falta por firmar se firma aunque se mire otro.
 */
export async function Documentacion({ centroParametro }: { centroParametro: string | null }) {
  const contexto = await cargarContexto(centroParametro);
  if (!contexto.ok)
    return (
      <Marco>
        <AvisoDeError mensaje={contexto.mensaje} />
      </Marco>
    );

  // Qué ve cada rol, cerrado ante lo desconocido (choque 2, revisiones SQL H2, A1 y A2).
  const criterio = criterioDocumentacion(contexto.rol);
  if (criterio.tipos?.length === 0) return null;
  const r = await leerPendientes(contexto.sesion, criterio);
  if (!r.ok)
    return (
      <Marco>
        <AvisoDeError mensaje={r.mensaje} />
      </Marco>
    );

  const grupos = agruparYOrdenar(r.alertas);
  if (grupos.length === 0) {
    return (
      <Marco>
        <EstadoVacio
          icono="documento"
          titulo={t('agenda.documentacion.vacio')}
          explicacion={t('agenda.documentacion.vacioExplicacion')}
        />
      </Marco>
    );
  }

  const visibles = grupos.slice(0, TAMANO_PANEL);
  // Solo los nombres de los seis que se pintan, no los de toda la bandeja.
  const n = await leerNombresPacientes(
    contexto.sesion,
    visibles.map((g) => g.pacienteId),
  );
  if (!n.ok)
    return (
      <Marco>
        <AvisoDeError mensaje={n.mensaje} />
      </Marco>
    );

  const presentados = visibles.map((g) => {
    const fila = n.nombres.get(g.pacienteId);
    const nombre = [fila?.nombre, fila?.apellidos].filter(Boolean).join(' ');
    return presentarGrupo(g, {
      rol: contexto.rol,
      hoy: contexto.hoy,
      nombre: nombre === '' ? null : nombre,
      modo: 'desplegable',
      filtros: { tipo: null, nivel: null, paciente: null },
    });
  });
  const hayMas = grupos.length > TAMANO_PANEL || r.recortada;

  return (
    <Marco pacientes={enFoco(presentados)}>
      {r.recortada && (
        <p className="text-muted-foreground text-xs">
          {tCon('agenda.documentacion.recorte', { leidos: r.alertas.length, total: r.total })}
        </p>
      )}
      <ul className="divide-border flex flex-col divide-y">
        {presentados.map((g) => (
          <li key={g.pacienteId}>
            <FilaPaciente grupo={g} prefijo="panel" modo="desplegable" />
          </li>
        ))}
      </ul>
      {hayMas && (
        <Link
          href="/agenda/documentacion"
          className="focus-visible:ring-ring/50 inline-flex min-h-11 items-center self-start text-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2"
        >
          {tCon(r.recortada ? 'agenda.documentacion.pie.recortada' : 'agenda.documentacion.pie.normal', {
            n: r.total,
            m: grupos.length,
          })}
        </Link>
      )}
    </Marco>
  );
}
