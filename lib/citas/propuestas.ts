import 'server-only';

import { mapearErrorCitas, mensajeParaMotivo } from './errores';
import type { DatosConfirmarPropuesta, DatosDescartarPropuesta } from './esquemas';
import type { ResultadoCitas, Sesion } from './tipos';

export type PropuestaPendiente = {
  id: string;
  serieId: string | null;
  citaId: string | null;
  pacienteId: string;
  profesionalId: string;
  centroId: string | null;
  motivo: 'festivo' | 'ausencia' | 'ocupada' | 'zona_cambiada' | 'regla_cambiada';
  fechaPrevista: string;
  horaLocalPrevista: string;
  inicioPropuesto: string | null;
  finPropuesto: string | null;
  zonaHoraria: string;
};

/**
 * Propuestas pendientes que el usuario actual puede ver, según
 * `propuestas_cita_lectura` (administrador; el profesional dueño; el técnico
 * de su centro). Nunca formatea horas: eso es `presentacion.ts`.
 *
 * Devuelve `ResultadoCitas` como el resto del módulo, y NO una lista vacía
 * ante un error (hallazgo 5 de la revisión con Opus del 11-09-2026): lo que
 * hay pendiente son sesiones de pacientes sin colocar, y una pantalla que no
 * distinga «no hay nada que decidir» de «no se pudo leer» las esconde sin
 * decirlo. Quien llama muestra `mensaje` y no una lista vacía.
 */
export async function listarPropuestasPendientes(
  sesion: Sesion,
): Promise<ResultadoCitas<{ propuestas: PropuestaPendiente[] }>> {
  const { data, error } = await sesion.supabase
    .from('propuestas_cita')
    .select(
      'id, serie_id, cita_id, paciente_id, profesional_id, centro_id, motivo, fecha_prevista, hora_local_prevista, inicio_propuesto, fin_propuesto, zona_horaria',
    )
    .eq('estado', 'pendiente')
    .order('fecha_prevista', { ascending: true });

  if (error) {
    console.error('listarPropuestasPendientes: fallo al leer propuestas_cita', error);
    const motivo = mapearErrorCitas(error);
    return { ok: false, motivo, mensaje: mensajeParaMotivo(motivo) };
  }

  return {
    ok: true,
    propuestas: (data ?? []).map((fila) => ({
      id: fila.id,
      serieId: fila.serie_id,
      citaId: fila.cita_id,
      pacienteId: fila.paciente_id,
      profesionalId: fila.profesional_id,
      centroId: fila.centro_id,
      motivo: fila.motivo,
      fechaPrevista: fila.fecha_prevista,
      horaLocalPrevista: fila.hora_local_prevista,
      inicioPropuesto: fila.inicio_propuesto,
      finPropuesto: fila.fin_propuesto,
      zonaHoraria: fila.zona_horaria,
    })),
  };
}

/**
 * Confirma una propuesta pendiente. Con `cita_id`: mueve la cita existente
 * (la base pone la marca de origen, no queda desviada). Sin `cita_id`: crea
 * la cita desde la propuesta (sí queda desviada, y conserva el tipo de
 * terapia de su serie). Falla con `parametro_invalido` si la propuesta no
 * tiene horario (§7: «si ninguno vale, propuesta sin hora, la decide una
 * persona» — aquí no hay nada que confirmar, solo descartar o resolver a mano
 * en otra pantalla).
 */
export async function confirmarPropuesta(
  sesion: Sesion,
  entrada: DatosConfirmarPropuesta,
): Promise<ResultadoCitas<{ citaId: string }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_confirmar_propuesta', {
    p_propuesta_id: entrada.propuestaId,
  });

  if (error) {
    console.error('confirmarPropuesta: agenda_confirmar_propuesta() falló', error);
    const motivo = mapearErrorCitas(error);
    return { ok: false, motivo, mensaje: mensajeParaMotivo(motivo) };
  }

  return { ok: true, citaId: data as string };
}

/** Descarta una propuesta pendiente sin crear ni mover ninguna cita. */
export async function descartarPropuesta(
  sesion: Sesion,
  entrada: DatosDescartarPropuesta,
): Promise<ResultadoCitas> {
  const { error } = await sesion.supabase.rpc('agenda_descartar_propuesta', {
    p_propuesta_id: entrada.propuestaId,
  });

  if (error) {
    console.error('descartarPropuesta: agenda_descartar_propuesta() falló', error);
    const motivo = mapearErrorCitas(error);
    return { ok: false, motivo, mensaje: mensajeParaMotivo(motivo) };
  }

  return { ok: true };
}

/**
 * Genera las propuestas de un evento de outbox ya creado (por
 * `evento_zona_centro` o `evento_regla_serie`). Único sitio donde se llama a
 * `agenda_propuestas_de_evento()`: es idempotente por diseño, así que
 * llamarla dos veces sobre el mismo evento no duplica nada.
 */
export async function generarPropuestasDeEvento(
  sesion: Sesion,
  eventoId: string,
): Promise<ResultadoCitas<{ propuestaIds: string[] }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_propuestas_de_evento', {
    p_evento_id: eventoId,
  });

  if (error) {
    console.error('generarPropuestasDeEvento: agenda_propuestas_de_evento() falló', error);
    const motivo = mapearErrorCitas(error);
    return { ok: false, motivo, mensaje: mensajeParaMotivo(motivo) };
  }

  const resultado = data as { propuestas: string[] };
  return { ok: true, propuestaIds: resultado.propuestas ?? [] };
}
