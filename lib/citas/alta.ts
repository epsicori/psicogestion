import 'server-only';

import { createHash } from 'node:crypto';

import { z } from 'zod';

import { mapearErrorCitas, mensajeParaMotivo, resultadoDeError } from './errores';
import type { DatosAltaCita } from './esquemas';
import { confirmarPropuesta } from './propuestas';
import type { ResultadoCitas, Sesion } from './tipos';

/**
 * El alta de una cita o de una serie (T-028). Todo el cálculo vive en la base
 * (`agenda_bloques_profesional`, `agenda_previsualizar_alta`, `agenda_crear_*`):
 * aquí solo se transporta, se valida la forma y se pasa a camelCase. La única
 * consulta propia es `leerUltimasCitasPaciente`. Ni modalidad (ADR-075) ni
 * episodio: el corte B no los pinta.
 */

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// `time` de Postgres llega como «HH:MM:SS»; la interfaz y la firma usan «HH:MM».
const HORA = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/)
  .transform((valor) => valor.slice(0, 5));
// `timestamptz` llega con su desfase; se normaliza a ISO en UTC para que la firma no dependa de él.
const INSTANTE = z
  .string()
  .refine((valor) => !Number.isNaN(Date.parse(valor)))
  .transform((valor) => new Date(valor).toISOString());

export type BloqueAlta = {
  fecha: string;
  horaLocal: string;
  inicio: string;
  fin: string;
  estado: 'libre' | 'ocupado';
};

export async function leerBloques(
  sesion: Sesion,
  entrada: { profesionalId: string; centroId: string; desde: string; hasta: string; duracionMinutos: number },
): Promise<ResultadoCitas<{ bloques: BloqueAlta[]; huecosRaros: Record<string, number> }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_bloques_profesional', {
    p_profesional_id: entrada.profesionalId,
    p_centro_id: entrada.centroId,
    p_desde: entrada.desde,
    p_hasta: entrada.hasta,
    p_duracion_minutos: entrada.duracionMinutos,
  });

  if (error) {
    console.error('leerBloques: agenda_bloques_profesional() falló', error);
    const motivo = mapearErrorCitas(error);
    return { ok: false, motivo, mensaje: mensajeParaMotivo(motivo) };
  }

  // Hueco raro (T-043) por clave de tramo libre. La clave debe coincidir con `HuecoVista.clave`
  // (`${fecha}T${HH:MM}`). El tipo generado no dice `| null` en las columnas de una función
  // `table`, pero la base lo manda: `?? null` y la guarda de entero positivo.
  const huecosRaros: Record<string, number> = {};
  for (const fila of data ?? []) {
    const minutos: number | null = fila.hueco_raro_minutos ?? null;
    if (fila.estado === 'libre' && typeof minutos === 'number' && Number.isInteger(minutos) && minutos > 0) {
      huecosRaros[`${fila.fecha}T${fila.hora_local.slice(0, 5)}`] = minutos;
    }
  }

  return {
    ok: true,
    huecosRaros,
    bloques: (data ?? []).map((fila) => ({
      fecha: fila.fecha,
      horaLocal: fila.hora_local.slice(0, 5),
      inicio: fila.inicio,
      fin: fila.fin,
      estado: fila.estado === 'libre' ? 'libre' : 'ocupado',
    })),
  };
}

export type CitaPasadaAlta = { inicio: string; zonaHoraria: string };

/** Cuántas citas pasadas se leen: las que `sugerirHuecos` usa como máximo. */
export const MAXIMO_CITAS_PASADAS = 6;

/**
 * Las últimas citas no canceladas del paciente con ese profesional, anteriores a `antesDe`.
 * Dos ramas por rol, como `leerCita`: el técnico lee `citas_agenda` (la puerta que le deja la
 * RLS), el resto `citas`. Solo `inicio` y `zona_horaria`: ni tipo, ni nota, ni nombre. Es la
 * única consulta propia sobre citas del alta (T-028 §1.C).
 */
export async function leerUltimasCitasPaciente(
  sesion: Sesion,
  rol: string,
  entrada: { pacienteId: string; profesionalId: string; antesDe: Date },
): Promise<ResultadoCitas<{ citas: CitaPasadaAlta[] }>> {
  // `citas_agenda` es la vista del técnico con las mismas columnas que se leen aquí; el tipo
  // generado no sabe que son intercambiables, así que se fija al de `citas`.
  const tabla = (rol === 'tecnico_administrativo' ? 'citas_agenda' : 'citas') as 'citas';
  const { data, error } = await sesion.supabase
    .from(tabla)
    .select('inicio, zona_horaria')
    .eq('paciente_id', entrada.pacienteId)
    .eq('profesional_id', entrada.profesionalId)
    .neq('estado', 'cancelada')
    .lt('inicio', entrada.antesDe.toISOString())
    .order('inicio', { ascending: false })
    .limit(MAXIMO_CITAS_PASADAS);

  if (error) {
    console.error(`leerUltimasCitasPaciente: fallo al leer ${tabla}`, error);
    const motivo = mapearErrorCitas(error);
    return { ok: false, motivo, mensaje: mensajeParaMotivo(motivo) };
  }

  return {
    ok: true,
    citas: (data ?? []).flatMap((fila) =>
      fila.inicio && fila.zona_horaria ? [{ inicio: fila.inicio, zonaHoraria: fila.zona_horaria }] : [],
    ),
  };
}

const ALTERNATIVA = z.strictObject({ fecha: FECHA, inicio: INSTANTE, fin: INSTANTE });

const esquemaPrevisualizacionAlta = z
  .strictObject({
    zona_horaria: z.string().min(1),
    sesiones: z.array(
      z.strictObject({
        fecha: FECHA,
        hora_local: HORA,
        inicio: INSTANTE,
        fin: INSTANTE,
        clasificacion: z.enum(['normal', 'inexistente', 'ambigua']),
        bloqueo: z.enum(['festivo', 'ausencia', 'ocupada']).nullable(),
        alternativa: ALTERNATIVA.nullable(),
      }),
    ),
  })
  .transform((p) => ({
    zonaHoraria: p.zona_horaria,
    sesiones: p.sesiones.map((s) => ({
      fecha: s.fecha,
      horaLocal: s.hora_local,
      inicio: s.inicio,
      fin: s.fin,
      clasificacion: s.clasificacion,
      bloqueo: s.bloqueo,
      alternativa: s.alternativa,
    })),
  }));

export type PrevisualizacionAlta = z.output<typeof esquemaPrevisualizacionAlta>;

/** Huella de lo que se enseñó: si la serie cambia entre medias, `guardarAlta` no guarda. */
export function firmarPrevisualizacionAlta(
  previa: PrevisualizacionAlta,
  regla: {
    pacienteId: string;
    profesionalId: string;
    centroId: string;
    tipoTerapiaId?: string | null;
    periodicidad: string;
    horaLocal: string;
    duracionMinutos: number;
  },
): string {
  const canonico = JSON.stringify([
    regla.pacienteId,
    regla.profesionalId,
    regla.centroId,
    regla.tipoTerapiaId ?? null,
    regla.periodicidad,
    regla.horaLocal,
    regla.duracionMinutos,
    previa.zonaHoraria,
    previa.sesiones.map((s) => [s.fecha, s.inicio, s.bloqueo, s.alternativa?.inicio ?? null]),
  ]);
  return createHash('sha256').update(canonico, 'utf8').digest('hex');
}

export type EntradaPrevisualizarAlta = {
  pacienteId: string;
  profesionalId: string;
  centroId: string;
  /** Solo entra en la firma: la base no lo necesita para calcular las sesiones. */
  tipoTerapiaId?: string | null;
  periodicidad: 'semanal' | 'quincenal' | 'mensual';
  diaSemana: number;
  horaLocal: string;
  duracionMinutos: number;
  desde: string;
  sesionesTotales: number;
};

export async function previsualizarAlta(
  sesion: Sesion,
  entrada: EntradaPrevisualizarAlta,
): Promise<ResultadoCitas<{ previa: PrevisualizacionAlta; firma: string }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_previsualizar_alta', {
    p_paciente_id: entrada.pacienteId,
    p_profesional_id: entrada.profesionalId,
    p_centro_id: entrada.centroId,
    p_periodicidad: entrada.periodicidad,
    p_dia_semana: entrada.diaSemana,
    p_hora_local: entrada.horaLocal,
    p_duracion_minutos: entrada.duracionMinutos,
    p_desde: entrada.desde,
    p_sesiones_totales: entrada.sesionesTotales,
  });

  if (error) {
    console.error('previsualizarAlta: agenda_previsualizar_alta() falló', error);
    return resultadoDeError(error);
  }

  const analizada = esquemaPrevisualizacionAlta.safeParse(data);
  if (!analizada.success) {
    console.error('previsualizarAlta: la base devolvió una forma inesperada', analizada.error);
    return { ok: false, motivo: 'desconocido', mensaje: mensajeParaMotivo('desconocido') };
  }

  return {
    ok: true,
    previa: analizada.data,
    firma: firmarPrevisualizacionAlta(analizada.data, entrada),
  };
}

export async function crearCitaSuelta(
  sesion: Sesion,
  entrada: Pick<
    DatosAltaCita,
    'pacienteId' | 'profesionalId' | 'centroId' | 'tipoTerapiaId' | 'fecha' | 'horaLocal' | 'sala' | 'notaOperativa'
  > & { duracionMinutos: number },
): Promise<ResultadoCitas<{ citaId: string }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_crear_cita', {
    p_paciente_id: entrada.pacienteId,
    p_profesional_id: entrada.profesionalId,
    p_centro_id: entrada.centroId,
    p_tipo_terapia_id: entrada.tipoTerapiaId,
    p_fecha: entrada.fecha,
    p_hora_local: entrada.horaLocal,
    p_duracion_minutos: entrada.duracionMinutos,
    p_sala: entrada.sala ?? undefined,
    p_nota_operativa: entrada.notaOperativa ?? undefined,
  });

  if (error) {
    console.error('crearCitaSuelta: agenda_crear_cita() falló', error);
    return resultadoDeError(error);
  }

  return { ok: true, citaId: data as string };
}

export type PropuestaPendienteAlta = { fecha: string; motivo: string };

/**
 * Crea la serie con `p_estricta_primera`: si la primera sesión choca no se crea nada (23P01).
 * Después confirma, una a una, las propuestas cuya fecha el usuario aceptó como alternativa; el
 * resto queda como propuesta pendiente para la bandeja de la agenda.
 */
export async function crearSerieAlta(
  sesion: Sesion,
  entrada: Pick<
    DatosAltaCita,
    | 'pacienteId'
    | 'profesionalId'
    | 'centroId'
    | 'tipoTerapiaId'
    | 'fecha'
    | 'horaLocal'
    | 'sala'
    | 'notaOperativa'
    | 'excluir'
    | 'aceptarAlternativas'
  > & {
    periodicidad: 'semanal' | 'quincenal' | 'mensual';
    diaSemana: number;
    duracionMinutos: number;
    sesionesTotales: number;
  },
): Promise<ResultadoCitas<{ serieId: string; citaIds: string[]; propuestasPendientes: PropuestaPendienteAlta[] }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_crear_serie', {
    p_paciente_id: entrada.pacienteId,
    p_profesional_id: entrada.profesionalId,
    p_centro_id: entrada.centroId,
    p_tipo_terapia_id: entrada.tipoTerapiaId,
    p_periodicidad: entrada.periodicidad,
    p_dia_semana: entrada.diaSemana,
    p_hora_local: entrada.horaLocal,
    p_duracion_minutos: entrada.duracionMinutos,
    p_desde: entrada.fecha,
    p_sesiones_totales: entrada.sesionesTotales,
    p_estricta_primera: true,
    p_excluir: entrada.excluir,
    p_sala: entrada.sala ?? undefined,
    p_nota_operativa: entrada.notaOperativa ?? undefined,
  });

  if (error) {
    console.error('crearSerieAlta: agenda_crear_serie() falló', error);
    return resultadoDeError(error);
  }

  const resultado = data as {
    serie_id: string;
    citas: { cita_id: string; fecha: string }[];
    propuestas: { propuesta_id: string; fecha: string; motivo: string }[];
  };

  const citaIds = resultado.citas.map((c) => c.cita_id);
  const pendientes: PropuestaPendienteAlta[] = [];
  for (const propuesta of resultado.propuestas) {
    if (!entrada.aceptarAlternativas.includes(propuesta.fecha)) {
      pendientes.push({ fecha: propuesta.fecha, motivo: propuesta.motivo });
      continue;
    }
    const confirmada = await confirmarPropuesta(sesion, { propuestaId: propuesta.propuesta_id });
    if (confirmada.ok) citaIds.push(confirmada.citaId);
    else pendientes.push({ fecha: propuesta.fecha, motivo: propuesta.motivo });
  }

  return { ok: true, serieId: resultado.serie_id, citaIds, propuestasPendientes: pendientes };
}
