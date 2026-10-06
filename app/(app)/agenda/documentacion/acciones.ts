'use server';

import { leerNombresPacientes, leerPendientes } from '@/lib/citas/agenda';

import { criterioDocumentacion } from '../bloques';
import { cargarContexto } from '../datos';
import {
  agruparYOrdenar,
  coincideBusqueda,
  MAXIMO_RESULTADOS,
  presentarGrupo,
  tiposConsultados,
  type GrupoPresentado,
} from '../pendientes';
import { esquemaTermino, leerFiltrosDeFormulario } from './parametros';

export type EstadoBusqueda =
  | { fase: 'inicial' }
  | { fase: 'invalida' }
  | { fase: 'fallo' }
  | {
      fase: 'resultados';
      grupos: GrupoPresentado[];
      coincidencias: number;
      recortada: boolean;
      leidos: number;
      total: number;
    };

/**
 * Busca pacientes con pendientes por nombre o apellidos (T-048, D10). Es una Server Action por
 * POST: el término no viaja en la URL ni en ningún filtro de PostgREST (la coincidencia se hace
 * aquí, sobre lo que la RLS ya dejó leer) ni en ninguna consola. De la petición solo se leen
 * `termino`, `tipo` y `nivel`; el criterio de rol sale de la sesión. Sin `try`: una redirección a
 * `/login` sigue su curso.
 */
export async function buscarPendientes(_previo: EstadoBusqueda, datos: FormData): Promise<EstadoBusqueda> {
  const crudo = datos.get('termino');
  const termino = esquemaTermino.safeParse(typeof crudo === 'string' ? crudo : undefined);
  // Antes de la sesión y de la base: un término inválido no consulta nada.
  if (!termino.success) return { fase: 'invalida' };

  const contexto = await cargarContexto(null);
  if (!contexto.ok) return { fase: 'fallo' };

  const criterio = criterioDocumentacion(contexto.rol);
  const f = leerFiltrosDeFormulario(datos);
  const r = await leerPendientes(contexto.sesion, {
    soloPropias: criterio.soloPropias,
    tipos: tiposConsultados(criterio, f.tipo),
    nivel: f.nivel ?? undefined,
  });
  if (!r.ok) return { fase: 'fallo' };

  const grupos = agruparYOrdenar(r.alertas);
  const n = await leerNombresPacientes(
    contexto.sesion,
    grupos.map((g) => g.pacienteId),
  );
  if (!n.ok) return { fase: 'fallo' };

  // El orden ya es el de urgencia.
  const coinciden = grupos.filter((g) => {
    const fila = n.nombres.get(g.pacienteId);
    return coincideBusqueda(termino.data, fila?.nombre ?? null, fila?.apellidos ?? null);
  });

  return {
    fase: 'resultados',
    grupos: coinciden.slice(0, MAXIMO_RESULTADOS).map((g) => {
      const fila = n.nombres.get(g.pacienteId);
      const nombre = [fila?.nombre, fila?.apellidos].filter(Boolean).join(' ');
      return presentarGrupo(g, {
        rol: contexto.rol,
        hoy: contexto.hoy,
        nombre: nombre === '' ? null : nombre,
        modo: 'desplegable',
        filtros: { ...f, paciente: null },
      });
    }),
    coincidencias: coinciden.length,
    recortada: r.recortada,
    leidos: r.alertas.length,
    total: r.total,
  };
}
