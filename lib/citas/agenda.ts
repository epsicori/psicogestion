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
  tipo: Database['public']['Enums']['tipo_alerta_documentacion'];
  fechaReferencia: string | null;
  creadaEn: string | null;
  /** Nivel de la nota pendiente, calculado en la base (`alertas_documentacion_nivel`, T-015). */
  nivel: 1 | 2 | 3 | null;
  /** Identificadores del origen (D8 de T-048): nada clínico. */
  origenTabla: string | null;
  origenId: string | null;
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
 * Hasta cuántas alertas lee la bandeja (T-048, D2). PostgREST ya recorta a `max_rows = 1000`
 * (`supabase/config.toml`), pero en silencio: aquí el tope es explícito y, si el recuento exacto
 * lo supera, `recortada` lo dice para que la pantalla lo declare.
 */
export const TOPE_PENDIENTES = 1000;

/**
 * Las alertas de documentación abiertas que la RLS deja ver, de la más urgente a la menos
 * (nivel desc, referencia y creación asc, nulos al final). Nada clínico: ocho columnas, y las
 * dos de origen son identificadores para el destino de cada pendiente. Lee siempre desde 0
 * (T-040 R2A-H1: un `offset` más allá del final da 416); agrupar y paginar es de memoria.
 *
 * `soloPropias`: la política de lectura da al administrador todas las alertas de la
 * organización, y la bandeja no puede ser global (choque 2 de interfaz.md: el secreto
 * profesional es del profesional, no del cargo). Con él, solo las del profesional de la sesión.
 *
 * Se lee de la vista invoker `alertas_documentacion_nivel` (T-015): misma RLS que la tabla,
 * más el `nivel`, que se calcula allí y en ningún otro sitio. Nunca recibe un término de búsqueda.
 */
export async function leerPendientes(
  sesion: Sesion,
  {
    soloPropias = false,
    tipos,
    nivel,
    pacienteId,
  }: {
    soloPropias?: boolean;
    tipos?: readonly AlertaPendiente['tipo'][];
    nivel?: 1 | 2 | 3;
    pacienteId?: string;
  } = {},
): Promise<ResultadoCitas<{ alertas: AlertaPendiente[]; total: number; recortada: boolean }>> {
  // Una intersección vacía de tipos no se le pasa a PostgREST: no hay nada que leer.
  if (tipos && tipos.length === 0) return { ok: true, alertas: [], total: 0, recortada: false };

  let consulta = sesion.supabase
    .from('alertas_documentacion_nivel')
    .select('id, paciente_id, tipo, fecha_referencia, creada_en, nivel, origen_tabla, origen_id', { count: 'exact' })
    .eq('estado', 'abierta');
  if (soloPropias) consulta = consulta.eq('profesional_id', sesion.usuario.id);
  if (tipos) consulta = consulta.in('tipo', [...tipos]);
  if (nivel) consulta = consulta.eq('nivel', nivel);
  if (pacienteId) consulta = consulta.eq('paciente_id', pacienteId);
  const { data, error, count } = await consulta
    .order('nivel', { ascending: false, nullsFirst: false })
    .order('fecha_referencia', { ascending: true, nullsFirst: false })
    .order('creada_en', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .range(0, TOPE_PENDIENTES - 1);

  if (error) {
    console.error('leerPendientes: fallo al leer alertas_documentacion_nivel', error);
    return fallo(error);
  }

  // Las columnas de una vista llegan nulables en los tipos generados; la tabla base no lo es.
  const alertas = (data ?? []).flatMap((fila) =>
    fila.id && fila.paciente_id && fila.tipo
      ? [
          {
            id: fila.id,
            pacienteId: fila.paciente_id,
            tipo: fila.tipo,
            fechaReferencia: fila.fecha_referencia,
            creadaEn: fila.creada_en,
            nivel: aNivel(fila.nivel),
            origenTabla: fila.origen_tabla,
            origenId: fila.origen_id,
          },
        ]
      : [],
  );
  const total = count ?? alertas.length;
  const recortada = count === null ? alertas.length >= TOPE_PENDIENTES : count > alertas.length;
  return { ok: true, alertas, total, recortada };
}

const TANDA_NOMBRES = 100;

/**
 * Nombre y apellidos de los pacientes pedidos, por `pacientes` y su RLS, en tandas de 100 ids
 * como mucho. Quien lo llama pide solo los que pinta; el que la RLS no deja ver no aparece en el
 * mapa y se pinta con la etiqueta genérica. Nunca recibe un término de búsqueda.
 */
export async function leerNombresPacientes(
  sesion: Sesion,
  ids: readonly string[],
): Promise<
  ResultadoCitas<{ nombres: ReadonlyMap<string, { nombre: string | null; apellidos: string | null }> }>
> {
  const unicos = [...new Set(ids)];
  const nombres = new Map<string, { nombre: string | null; apellidos: string | null }>();
  if (unicos.length === 0) return { ok: true, nombres };

  const tandas: string[][] = [];
  for (let i = 0; i < unicos.length; i += TANDA_NOMBRES) tandas.push(unicos.slice(i, i + TANDA_NOMBRES));

  const respuestas = await Promise.all(
    tandas.map((tanda) => sesion.supabase.from('pacientes').select('id, nombre, apellidos').in('id', tanda)),
  );
  for (const respuesta of respuestas) {
    if (respuesta.error) {
      console.error('leerNombresPacientes: fallo al leer pacientes', respuesta.error);
      return fallo(respuesta.error);
    }
    for (const paciente of respuesta.data ?? []) {
      nombres.set(paciente.id, { nombre: paciente.nombre, apellidos: paciente.apellidos });
    }
  }
  return { ok: true, nombres };
}

/** El estado que pinta el punto: «en curso» manda sobre el guardado (ADR-045), y nunca se guarda. */
export function estadoParaPunto(estado: EstadoCitaBd, enCurso: boolean): EstadoVisibleCita {
  return enCurso ? 'en_curso' : estado;
}
