import 'server-only';

import type { EstadoVisibleCita } from '@/components/ui/estado-cita';

import type { Database } from '../supabase/tipos-bd';
import { mapearErrorCitas, mensajeParaMotivo } from './errores';
import type { ResultadoCitas, Sesion } from './tipos';

/**
 * Lecturas de la agenda (T-014). Todo pasa por la sesión del usuario y su
 * RLS: la clave de servicio no aparece aquí. Los instantes salen como `Date`
 * para que el servidor formatee en la zona del centro; nunca bajan crudos al
 * navegador (ver `presentacion.ts`).
 */

export type EstadoCitaBd = Database['public']['Enums']['estado_cita'];
type MotivoDesviacion = Database['public']['Enums']['motivo_desviacion_cita'];

/** Una fila de `agenda_citas_rango()`, en camelCase. Tipo y nota llegan nulos al técnico. */
export type FilaAgenda = {
  id: string;
  pacienteId: string;
  profesionalId: string;
  centroId: string | null;
  serieId: string | null;
  inicio: Date;
  fin: Date;
  zonaHoraria: string;
  estado: EstadoCitaBd;
  sala: string | null;
  desviada: boolean;
  motivoDesviacion: MotivoDesviacion | null;
  tipoTerapiaNombre: string | null;
  notaOperativa: string | null;
  pacienteNombre: string | null;
  pacienteApellidos: string | null;
  profesionalNombre: string | null;
  centroNombre: string | null;
  enCurso: boolean;
  reprogramable: boolean;
  notaPendiente: boolean;
};

/** Lo justo de una cita para decidir cómo moverla. */
export type FilaCitaMinima = {
  id: string;
  inicio: Date;
  fin: Date;
  serieId: string | null;
  desviada: boolean;
  centroId: string | null;
  zonaHoraria: string;
  estado: EstadoCitaBd;
};

export type AlertaPendiente = {
  id: string;
  pacienteId: string;
  pacienteNombre: string | null;
  tipo: Database['public']['Enums']['tipo_alerta_documentacion'];
  fechaReferencia: string | null;
  /** Nivel de la nota pendiente, calculado en la base (`alertas_documentacion_nivel`, T-015). */
  nivel: 1 | 2 | 3 | null;
};

function aNivel(valor: number | null): 1 | 2 | 3 | null {
  return valor === 1 || valor === 2 || valor === 3 ? valor : null;
}

function fallo(error: Parameters<typeof mapearErrorCitas>[0]) {
  const motivo = mapearErrorCitas(error);
  return { ok: false as const, motivo, mensaje: mensajeParaMotivo(motivo) };
}

/**
 * Las citas del rango `[desde, hasta)` que la RLS deja ver, por las dos
 * puertas (`citas` y `citas_agenda`). `en_curso`, `reprogramable` y
 * `nota_pendiente` los calcula la base: aquí no se decide ninguno.
 */
export async function leerCitasRango(
  sesion: Sesion,
  desde: Date,
  hasta: Date,
): Promise<ResultadoCitas<{ filas: FilaAgenda[] }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_citas_rango', {
    p_desde: desde.toISOString(),
    p_hasta: hasta.toISOString(),
  });

  if (error) {
    console.error('leerCitasRango: agenda_citas_rango() falló', error);
    return fallo(error);
  }

  return {
    ok: true,
    filas: (data ?? []).map((fila) => ({
      id: fila.id,
      pacienteId: fila.paciente_id,
      profesionalId: fila.profesional_id,
      centroId: fila.centro_id ?? null,
      serieId: fila.serie_id ?? null,
      inicio: new Date(fila.inicio),
      fin: new Date(fila.fin),
      zonaHoraria: fila.zona_horaria,
      estado: fila.estado,
      sala: fila.sala ?? null,
      desviada: fila.desviada,
      motivoDesviacion: fila.motivo_desviacion ?? null,
      tipoTerapiaNombre: fila.tipo_terapia_nombre ?? null,
      notaOperativa: fila.nota_operativa ?? null,
      pacienteNombre: fila.paciente_nombre ?? null,
      pacienteApellidos: fila.paciente_apellidos ?? null,
      profesionalNombre: fila.profesional_nombre ?? null,
      centroNombre: fila.centro_nombre ?? null,
      enCurso: fila.en_curso === true,
      reprogramable: fila.reprogramable === true,
      notaPendiente: fila.nota_pendiente === true,
    })),
  };
}

const COLUMNAS_MINIMAS = 'id, inicio, fin, serie_id, desviada, centro_id, zona_horaria, estado';

type FilaMinimaBd = {
  id: string | null;
  inicio: string | null;
  fin: string | null;
  serie_id: string | null;
  desviada: boolean | null;
  centro_id: string | null;
  zona_horaria: string | null;
  estado: EstadoCitaBd | null;
};

function aCitaMinima(fila: FilaMinimaBd): FilaCitaMinima | null {
  if (!fila.id || !fila.inicio || !fila.fin || !fila.zona_horaria || !fila.estado) return null;
  return {
    id: fila.id,
    inicio: new Date(fila.inicio),
    fin: new Date(fila.fin),
    serieId: fila.serie_id,
    desviada: fila.desviada === true,
    centroId: fila.centro_id,
    zonaHoraria: fila.zona_horaria,
    estado: fila.estado,
  };
}

/**
 * Una cita por id, por la puerta que la RLS abra: primero `citas`, después
 * `citas_agenda` (la del técnico). No se decide por el rol: la RLS ya separa
 * las dos puertas, y así esto no queda acoplado a quién ve qué.
 */
export async function leerCita(
  sesion: Sesion,
  citaId: string,
): Promise<ResultadoCitas<{ cita: FilaCitaMinima }>> {
  const directa = await sesion.supabase.from('citas').select(COLUMNAS_MINIMAS).eq('id', citaId).maybeSingle();
  if (directa.error) {
    console.error('leerCita: fallo al leer citas', directa.error);
    return fallo(directa.error);
  }
  const deCitas = directa.data ? aCitaMinima(directa.data) : null;
  if (deCitas) return { ok: true, cita: deCitas };

  const agenda = await sesion.supabase
    .from('citas_agenda')
    .select(COLUMNAS_MINIMAS)
    .eq('id', citaId)
    .maybeSingle();
  if (agenda.error) {
    console.error('leerCita: fallo al leer citas_agenda', agenda.error);
    return fallo(agenda.error);
  }
  const deAgenda = agenda.data ? aCitaMinima(agenda.data) : null;
  if (deAgenda) return { ok: true, cita: deAgenda };

  return { ok: false, motivo: 'no_autorizado', mensaje: mensajeParaMotivo('no_autorizado') };
}

/**
 * La zona horaria de un centro, o la de la organización si `centroId` es
 * nulo. Única fuente de la zona en la agenda.
 */
export async function zonaDeCentro(
  sesion: Sesion,
  centroId: string | null,
): Promise<ResultadoCitas<{ zona: string }>> {
  const { data, error } = await sesion.supabase.rpc('zona_horaria_centro', {
    // Igual que crearSerie: el generador no modela el null que la función acepta.
    p_centro_id: centroId as string,
  });

  if (error) {
    console.error('zonaDeCentro: zona_horaria_centro() falló', error);
    return fallo(error);
  }
  if (typeof data !== 'string' || data.length === 0) {
    return { ok: false, motivo: 'desconocido', mensaje: mensajeParaMotivo('desconocido') };
  }
  return { ok: true, zona: data };
}

/**
 * Las alertas de documentación abiertas que la RLS deja ver, de la más
 * antigua a la más reciente. `alertas_documentacion` vive fuera del candado y
 * no contiene nada clínico; el nombre del paciente sale de `pacientes`, con
 * su propia RLS (si no lo deja ver, queda nulo).
 *
 * `soloPropias`: la política de lectura da al administrador todas las alertas de la
 * organización, y la bandeja no puede ser global (choque 2 de interfaz.md: el secreto
 * profesional es del profesional, no del cargo). Con él, solo las del profesional de la sesión.
 *
 * Se lee de la vista invoker `alertas_documentacion_nivel` (T-015): misma RLS que la tabla,
 * más el `nivel`, que se calcula allí y en ningún otro sitio.
 */
export async function leerAlertasNotaPendiente(
  sesion: Sesion,
  { soloPropias = false, tipos }: { soloPropias?: boolean; tipos?: readonly AlertaPendiente['tipo'][] } = {},
): Promise<ResultadoCitas<{ alertas: AlertaPendiente[] }>> {
  let consulta = sesion.supabase
    .from('alertas_documentacion_nivel')
    .select('id, paciente_id, tipo, fecha_referencia, creada_en, nivel')
    .eq('estado', 'abierta');
  if (soloPropias) consulta = consulta.eq('profesional_id', sesion.usuario.id);
  if (tipos) consulta = consulta.in('tipo', [...tipos]);
  const { data, error } = await consulta
    .order('fecha_referencia', { ascending: true })
    .order('creada_en', { ascending: true });

  if (error) {
    console.error('leerAlertasNotaPendiente: fallo al leer alertas_documentacion_nivel', error);
    return fallo(error);
  }

  // Las columnas de una vista llegan nulables en los tipos generados; la tabla base no lo es.
  const filas = (data ?? []).flatMap((fila) =>
    fila.id && fila.paciente_id && fila.tipo
      ? [{ ...fila, id: fila.id, paciente_id: fila.paciente_id, tipo: fila.tipo }]
      : [],
  );
  const ids = [...new Set(filas.map((fila) => fila.paciente_id))];
  const nombres = new Map<string, string>();

  if (ids.length > 0) {
    const pacientes = await sesion.supabase.from('pacientes').select('id, nombre, apellidos').in('id', ids);
    if (pacientes.error) {
      console.error('leerAlertasNotaPendiente: fallo al leer pacientes', pacientes.error);
      return fallo(pacientes.error);
    }
    for (const paciente of pacientes.data ?? []) {
      nombres.set(paciente.id, [paciente.nombre, paciente.apellidos].filter(Boolean).join(' '));
    }
  }

  return {
    ok: true,
    alertas: filas.map((fila) => ({
      id: fila.id,
      pacienteId: fila.paciente_id,
      pacienteNombre: nombres.get(fila.paciente_id) ?? null,
      tipo: fila.tipo,
      fechaReferencia: fila.fecha_referencia,
      nivel: aNivel(fila.nivel),
    })),
  };
}

/** El estado que pinta el punto: «en curso» manda sobre el guardado (ADR-045), y nunca se guarda. */
export function estadoParaPunto(estado: EstadoCitaBd, enCurso: boolean): EstadoVisibleCita {
  return enCurso ? 'en_curso' : estado;
}
