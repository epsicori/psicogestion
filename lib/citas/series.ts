import 'server-only';

import { mapearErrorCitas, mensajeParaMotivo } from './errores';
import type { DatosCancelarCita, DatosCrearSerie, DatosEditarSerie } from './esquemas';
import type { ResultadoCitas, Sesion } from './tipos';

/**
 * Crea una serie y la materializa entera en una sola llamada a
 * `agenda_crear_serie()` (§2 del diseño de T-011: la materialización vive en
 * Postgres, no aquí — cero cálculo de instantes en TypeScript). Devuelve los
 * identificadores de lo creado; el formateo de horas es cosa de
 * `presentacion.ts`, nunca de este módulo.
 */
export async function crearSerie(
  sesion: Sesion,
  entrada: DatosCrearSerie,
): Promise<ResultadoCitas<{ serieId: string; citaIds: string[]; propuestaIds: string[] }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_crear_serie', {
    p_paciente_id: entrada.pacienteId,
    p_profesional_id: entrada.profesionalId,
    // El generador de tipos no modela la nulabilidad de un argumento uuid sin
    // default: la función SQL sí acepta null (centro/tipo de terapia
    // opcionales), así que aquí se afirma explícitamente — mismo patrón que
    // lib/cuentas/invitar.ts con p_centro_id.
    p_centro_id: entrada.centroId as string,
    p_tipo_terapia_id: entrada.tipoTerapiaId as string,
    p_periodicidad: entrada.periodicidad,
    p_dia_semana: entrada.diaSemana,
    p_hora_local: entrada.horaLocal,
    p_duracion_minutos: entrada.duracionMinutos,
    p_desde: entrada.desde,
    p_sesiones_totales: entrada.sesionesTotales ?? undefined,
    p_fin_el: entrada.finEl ?? undefined,
  });

  if (error) {
    console.error('crearSerie: agenda_crear_serie() falló', error);
    const motivo = mapearErrorCitas(error);
    return { ok: false, motivo, mensaje: mensajeParaMotivo(motivo) };
  }

  const resultado = data as {
    serie_id: string;
    citas: { cita_id: string }[];
    propuestas: { propuesta_id: string }[];
  };

  return {
    ok: true,
    serieId: resultado.serie_id,
    citaIds: resultado.citas.map((c) => c.cita_id),
    propuestaIds: resultado.propuestas.map((p) => p.propuesta_id),
  };
}

/**
 * Cancela una cita de una serie. `entrada.alcance` es obligatorio por tipo
 * (`esquemaAlcance`, sin valor por defecto): la pregunta «¿solo esta, o esta
 * y las siguientes?» no se puede saltar. `esta_y_siguientes` nunca toca una
 * cita pasada ni una ya desviada — lo hace cumplir la base
 * (`agenda_cancelar_cita()` + el disparador `fn_proteger_cita_pasada`), esto
 * solo transporta el resultado.
 */
export async function cancelarCita(
  sesion: Sesion,
  entrada: DatosCancelarCita,
): Promise<ResultadoCitas<{ canceladas: string[]; saltadasDesviadas: string[] }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_cancelar_cita', {
    p_cita_id: entrada.citaId,
    p_alcance: entrada.alcance,
    p_motivo: entrada.motivo ?? undefined,
  });

  if (error) {
    console.error('cancelarCita: agenda_cancelar_cita() falló', error);
    const motivo = mapearErrorCitas(error);
    return { ok: false, motivo, mensaje: mensajeParaMotivo(motivo) };
  }

  const resultado = data as { canceladas: string[]; saltadas_desviadas: string[] };
  return {
    ok: true,
    canceladas: resultado.canceladas ?? [],
    saltadasDesviadas: resultado.saltadas_desviadas ?? [],
  };
}

/**
 * Edita una cita de una serie. `esta`: delega en `agenda_actualizar_cita()`
 * de T-010 (mismo camino que `desplazarCita()` de `citas.ts` — no hay un
 * segundo camino de escritura de citas). `esta_y_siguientes`: NO mueve
 * ninguna cita, cambia la regla de la serie y devuelve las propuestas que se
 * generan para que quien llama las confirme una a una
 * (`propuestas.ts::confirmarPropuesta`). `entrada.fecha` (T-011b) es la
 * fecha nueva de la cita ancla: desplaza la serie de semana (o de mes, en
 * `mensual`), no solo de día dentro de la misma.
 */
export async function editarSerie(
  sesion: Sesion,
  entrada: DatosEditarSerie,
): Promise<ResultadoCitas<{ alcance: string; propuestaIds: string[] }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_editar_serie', {
    p_cita_id: entrada.citaId,
    p_alcance: entrada.alcance,
    p_estado: entrada.estado ?? undefined,
    p_sala: entrada.sala ?? undefined,
    p_inicio: entrada.inicio ?? undefined,
    p_fin: entrada.fin ?? undefined,
    p_dia_semana: entrada.diaSemana ?? undefined,
    p_hora_local: entrada.horaLocal ?? undefined,
    p_duracion_minutos: entrada.duracionMinutos ?? undefined,
    p_zona_horaria: entrada.zonaHoraria ?? undefined,
    p_fecha: entrada.fecha ?? undefined,
  });

  if (error) {
    console.error('editarSerie: agenda_editar_serie() falló', error);
    const motivo = mapearErrorCitas(error);
    return { ok: false, motivo, mensaje: mensajeParaMotivo(motivo) };
  }

  // 'esta': {alcance, cita_id} — sin propuestas. 'esta_y_siguientes':
  // {alcance, serie_id, evento_id, propuestas: string[]} (o {alcance,
  // serie_id, propuestas: []} si la regla no cambió de verdad).
  const resultado = data as { alcance: string; propuestas?: string[] };
  return { ok: true, alcance: resultado.alcance, propuestaIds: resultado.propuestas ?? [] };
}
