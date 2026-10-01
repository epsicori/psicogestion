import 'server-only';

import { createHash } from 'node:crypto';

import { z } from 'zod';

import { mensajeParaMotivo, resultadoDeError } from './errores';
import type { ResultadoCitas, Sesion } from './tipos';

/**
 * Previsualización de «esta y las siguientes» (T-011b §1.4, T-014 §8.2): qué
 * regla quedaría y a qué fecha y hora iría cada cita, SIN escribir nada. Todo
 * lo calcula la base (`agenda_previsualizar_edicion_serie`); aquí solo se
 * valida la forma y se pasa a camelCase. Nada de ordinales, días de la semana
 * ni fechas nuevas en TypeScript.
 */

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// `time` de Postgres llega como «HH:MM:SS»; la interfaz y la firma usan «HH:MM».
const HORA = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/)
  .transform((valor) => valor.slice(0, 5));
// `timestamptz` en jsonb llega con su desfase; se normaliza a ISO en UTC para
// que la firma no dependa de cómo lo escriba la base.
const INSTANTE = z
  .string()
  .refine((valor) => !Number.isNaN(Date.parse(valor)))
  .transform((valor) => new Date(valor).toISOString());
const PERIODICIDAD = z.enum(['semanal', 'quincenal', 'mensual']);

const REGLA_ANTERIOR = z.strictObject({
  periodicidad: PERIODICIDAD,
  dia_semana: z.int().min(1).max(7),
  hora_local: HORA,
  duracion_minutos: z.int().positive(),
  zona_horaria: z.string().min(1),
});

const esquemaPrevisualizacionSerie = z
  .strictObject({
    serie_id: z.uuid(),
    desde_cita_id: z.uuid(),
    fecha_origen: FECHA.nullable(),
    fecha_destino: FECHA.nullable(),
    cambia: z.boolean(),
    regla_anterior: REGLA_ANTERIOR,
    regla: REGLA_ANTERIOR.extend({
      ordinal: z.int().min(1).max(5).nullable(),
      ultimo: z.boolean(),
      recorte: z.boolean(),
    }),
    citas: z.array(
      z.strictObject({
        cita_id: z.uuid(),
        fecha_actual: FECHA,
        fecha_nueva: FECHA,
        hora_local: HORA,
        inicio: INSTANTE.nullable(),
        fin: INSTANTE.nullable(),
        clasificacion: z.enum(['normal', 'inexistente', 'ambigua']),
        recortada: z.boolean(),
      }),
    ),
  })
  .transform((p) => ({
    serieId: p.serie_id,
    desdeCitaId: p.desde_cita_id,
    fechaOrigen: p.fecha_origen,
    fechaDestino: p.fecha_destino,
    cambia: p.cambia,
    reglaAnterior: {
      periodicidad: p.regla_anterior.periodicidad,
      diaSemana: p.regla_anterior.dia_semana,
      horaLocal: p.regla_anterior.hora_local,
      duracionMinutos: p.regla_anterior.duracion_minutos,
      zonaHoraria: p.regla_anterior.zona_horaria,
    },
    regla: {
      periodicidad: p.regla.periodicidad,
      diaSemana: p.regla.dia_semana,
      horaLocal: p.regla.hora_local,
      duracionMinutos: p.regla.duracion_minutos,
      zonaHoraria: p.regla.zona_horaria,
      ordinal: p.regla.ordinal,
      ultimo: p.regla.ultimo,
      recorte: p.regla.recorte,
    },
    citas: p.citas.map((c) => ({
      citaId: c.cita_id,
      fechaActual: c.fecha_actual,
      fechaNueva: c.fecha_nueva,
      horaLocal: c.hora_local,
      inicio: c.inicio,
      fin: c.fin,
      clasificacion: c.clasificacion,
      recortada: c.recortada,
    })),
  }));

export type PrevisualizacionSerie = z.output<typeof esquemaPrevisualizacionSerie>;

/**
 * Huella de lo que se enseñó: la regla nueva y dónde cae cada cita. No es un
 * control de seguridad (el cliente puede mentir sobre su propia
 * confirmación); garantiza que lo que se aplica es lo que se vio, y si la
 * serie cambió entre medias, `reprogramarCita` no edita.
 */
export function firmarPrevisualizacion(previa: PrevisualizacionSerie): string {
  const { regla, citas } = previa;
  const canonico = JSON.stringify([
    regla.periodicidad,
    regla.diaSemana,
    regla.horaLocal,
    regla.duracionMinutos,
    regla.zonaHoraria,
    regla.ordinal,
    citas.map((c) => [c.citaId, c.fechaNueva, c.inicio]),
  ]);
  return createHash('sha256').update(canonico, 'utf8').digest('hex');
}

/**
 * Pide a la base la previsualización de mover la cita `citaId` al día
 * `fecha` a la hora `horaLocal` (las dos en la zona de la SERIE). Solo se
 * pasan esas tres cosas: arrastrar no cambia ni la duración ni la zona.
 * Si la respuesta no tiene la forma esperada, se falla cerrado.
 */
export async function previsualizarEdicionSerie(
  sesion: Sesion,
  entrada: { citaId: string; fecha: string; horaLocal: string },
): Promise<ResultadoCitas<{ previa: PrevisualizacionSerie; firma: string }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_previsualizar_edicion_serie', {
    p_cita_id: entrada.citaId,
    p_fecha: entrada.fecha,
    p_hora_local: entrada.horaLocal,
  });

  if (error) {
    console.error('previsualizarEdicionSerie: agenda_previsualizar_edicion_serie() falló', error);
    return resultadoDeError(error);
  }

  const leida = esquemaPrevisualizacionSerie.safeParse(data);
  if (!leida.success) {
    console.error('previsualizarEdicionSerie: la respuesta no tiene la forma esperada', leida.error.issues);
    return { ok: false, motivo: 'desconocido', mensaje: mensajeParaMotivo('desconocido') };
  }

  return { ok: true, previa: leida.data, firma: firmarPrevisualizacion(leida.data) };
}
