import 'server-only';

import { mapearErrorCitas, mensajeParaMotivo } from './errores';
import type { ResultadoCitas, Sesion } from './tipos';

/**
 * Lecturas del mapa de densidad anual (T-047). Dos funciones de la base, ambas `security
 * invoker`, con las mismas ramas por rol que `agenda_citas_rango`: aquí solo se llaman con la
 * sesión del usuario y su RLS. Devuelven recuentos y nombres de profesional, nunca columnas de
 * la cita. Nada se guarda entre peticiones (ADR-043): es lo que ve quien mira.
 */

/** `dia` es `AAAA-MM-DD` en la zona de la consulta; solo salen los días con citas. */
export type DiaConCitas = { dia: string; recuento: number };
export type ProfesionalDelAnio = { id: string; nombre: string | null };

type Consulta = { desde: Date; hasta: Date; zona: string; centroId: string | null };

function fallo(error: Parameters<typeof mapearErrorCitas>[0]) {
  const motivo = mapearErrorCitas(error);
  return { ok: false as const, motivo, mensaje: mensajeParaMotivo(motivo) };
}

/** Citas del año por día local de su inicio, sin las canceladas (D1): ≤ 366 filas por construcción. */
export async function leerDensidadAnual(
  sesion: Sesion,
  consulta: Consulta & { profesionalId: string | null },
): Promise<ResultadoCitas<{ dias: DiaConCitas[] }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_densidad_anual', {
    p_desde: consulta.desde.toISOString(),
    p_hasta: consulta.hasta.toISOString(),
    p_zona: consulta.zona,
    p_centro_id: consulta.centroId ?? undefined,
    p_profesional_id: consulta.profesionalId ?? undefined,
  });

  if (error) {
    console.error('leerDensidadAnual: agenda_densidad_anual() falló', error);
    return fallo(error);
  }
  return { ok: true, dias: (data ?? []).map((fila) => ({ dia: fila.dia, recuento: fila.recuento })) };
}

/** Quién tiene citas visibles en el año (canceladas incluidas, como el mes), para el selector. */
export async function listarProfesionalesDelAnio(
  sesion: Sesion,
  consulta: Consulta,
): Promise<ResultadoCitas<{ profesionales: ProfesionalDelAnio[] }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_profesionales_anuales', {
    p_desde: consulta.desde.toISOString(),
    p_hasta: consulta.hasta.toISOString(),
    p_zona: consulta.zona,
    p_centro_id: consulta.centroId ?? undefined,
  });

  if (error) {
    console.error('listarProfesionalesDelAnio: agenda_profesionales_anuales() falló', error);
    return fallo(error);
  }
  return {
    ok: true,
    profesionales: (data ?? []).map((fila) => ({ id: fila.profesional_id, nombre: fila.profesional_nombre ?? null })),
  };
}
