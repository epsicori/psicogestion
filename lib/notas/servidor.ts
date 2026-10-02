// T-012 · La lógica de servidor de la nota clínica (diseño §1.3 y §1.4).
//
// Las Server Actions de la pantalla (corte B) SOLO envuelven estas funciones: `exigirSesion()`
// → Zod → una de estas. Que vivan aquí, como `(sesion, entrada, contexto)`, es lo que deja al
// guion `scripts/t012-nota.ts` llamar «a lo que llamaría la Server Action» con una sesión real
// y sin cookies (lección de T-013a).
//
// Tres reglas que no se negocian:
//  1. Una lectura que no se pudo registrar es una lectura que no debe ocurrir (ADR-037):
//     `abrirEditorDeNota` registra el acceso ANTES de leer ninguna tabla clínica.
//  2. Se firma LO GUARDADO. `firmarNota` no recibe el texto: relee el borrador de la base.
//  3. El testigo del borrador (`borrador_actualizado_en`) es una CADENA opaca. Pasarlo por un
//     `Date` lo trunca a milisegundos y la condición `where borrador_actualizado_en = …` deja de
//     coincidir con la fila (la base guarda microsegundos).
import 'server-only';

import { prolongarDesbloqueo } from '@/lib/cuentas/candado';
import { registrarAccesoHistoria } from '@/lib/cuentas/accesos';
import type { Sesion } from '@/lib/cuentas/tipos';
import { formatearFechaCorta, formatearHora, formatearRango } from '@/lib/fechas';
import { ErrorFirmaVersion, firmarVersionNota } from '@/lib/huella/firmar';
import { t, tCon, type ClaveDeCatalogo } from '@/lib/i18n';

import { ROLES_COPROFESIONAL } from './coprofesional';
import { esquemaBorrador } from './cuerpo';
import { estadoDeNota, type EstadoNota } from './estado';
import { fechaDeSesion } from './fecha';
import { fraseDelSello, leerSello } from './sello';

// ---------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------

export type Contexto = { ip: string | null; agente: string | null };

export type VersionDeVista = {
  numero: number;
  autor: string;
  /** Formateada en servidor, en la zona de la cita (o la de la organización). */
  firmadaEn: string;
  motivo: string | null;
  alcance: 'individual' | 'conjunta';
  texto: string;
  reservadas: string | null;
  /** La frase de §2.13, leída del sobre sellado. */
  sello: string;
  /** Doce hexadecimales de la huella. */
  huellaCorta: string;
};

export type ModeloDeNota = {
  notaId: string;
  soyAutor: boolean;
  estado: EstadoNota;
  cabecera: {
    fechaSesion: string;
    horario: string | null;
    episodio: string;
    coprofesional: { id: string; nombre: string } | null;
  };
  borrador: { texto: string; reservadas: string; testigo: string } | null;
  versiones: VersionDeVista[];
  candidatosCoprofesional: { id: string; nombre: string }[];
  puedeSerConjunta: boolean;
};

/** Por qué una operación no se hizo. Lo traduce a palabras la pantalla (corte B). */
export type MotivoFallo =
  | 'bloqueada'
  | 'no_disponible'
  | 'no_autor'
  | 'sin_borrador'
  | 'conflicto'
  | 'vacia'
  | 'cita_ilegible'
  | 'falta_motivo'
  | 'coprofesional_invalido'
  | 'ya_firmada'
  | 'error';

export type ResultadoApertura =
  | { estado: 'bloqueada' }
  | { estado: 'no_disponible' }
  | { estado: 'error' }
  | { estado: 'elegir_episodio'; episodios: { id: string; etiqueta: string }[] }
  | { estado: 'abierta'; caducaEn: string | null; nota: ModeloDeNota };

export type ResultadoGuardado =
  | { ok: true; testigo: string; caducaEn: string | null }
  | { ok: false; motivo: MotivoFallo };

/** `nota` es `null` solo si la versión SE SELLÓ pero la relectura posterior falló. */
export type ResultadoDeNota =
  | { ok: true; nota: ModeloDeNota | null; caducaEn: string | null }
  | { ok: false; motivo: MotivoFallo };

type Supabase = Sesion['supabase'];

// ---------------------------------------------------------------------------------------
// Lecturas de apoyo
// ---------------------------------------------------------------------------------------

type Cabecera = {
  id: string;
  paciente_id: string;
  episodio_id: string;
  autor_id: string;
  fecha_sesion: string;
  cita_id: string | null;
  coprofesional_id: string | null;
  borrador_contenido: unknown;
  borrador_actualizado_en: string | null;
  borrador_abierta_en: string | null;
};

async function leerCabecera(supabase: Supabase, notaId: string): Promise<Cabecera | null> {
  const { data, error } = await supabase
    .from('notas_clinicas')
    .select(
      'id, paciente_id, episodio_id, autor_id, fecha_sesion, cita_id, coprofesional_id, borrador_contenido, borrador_actualizado_en, borrador_abierta_en',
    )
    .eq('id', notaId)
    .maybeSingle();
  if (error) {
    console.error('notas: no se pudo leer la cabecera', error);
    return null;
  }
  return data as Cabecera | null;
}

type Episodio = { modalidad: string; centroId: string | null; abiertoEn: string };

/**
 * Una lectura de apoyo con tres desenlaces que NO se pueden confundir (R2-H2, R2-H6): el dato,
 * «no hay dato» (`valor: null`, sin error) y «no se pudo leer» (`ok: false`). Lo que se sella o
 * se pinta nunca se decide con un error tomado por «no hay dato».
 */
type Leida<T> = { ok: true; valor: T } | { ok: false };

async function leerEpisodio(supabase: Supabase, episodioId: string): Promise<Leida<Episodio | null>> {
  const { data, error } = await supabase
    .from('episodios_asistenciales')
    .select('modalidad_relacional, centro_id, abierto_en')
    .eq('id', episodioId)
    .maybeSingle();
  if (error) {
    console.error('notas: no se pudo leer el episodio', error);
    return { ok: false };
  }
  if (!data) return { ok: true, valor: null };
  return {
    ok: true,
    valor: { modalidad: data.modalidad_relacional, centroId: data.centro_id, abiertoEn: data.abierto_en },
  };
}

/** Modalidad no individual Y más de un participante en alta (§1.4). */
async function puedeSerConjunta(supabase: Supabase, episodioId: string): Promise<Leida<boolean>> {
  const episodio = await leerEpisodio(supabase, episodioId);
  if (!episodio.ok) return { ok: false };
  if (!episodio.valor || episodio.valor.modalidad === 'individual') return { ok: true, valor: false };
  const { count, error } = await supabase
    .from('episodio_participantes')
    .select('id', { count: 'exact', head: true })
    .eq('episodio_id', episodioId)
    .is('baja_en', null);
  if (error) {
    console.error('notas: no se pudieron contar los participantes', error);
    return { ok: false };
  }
  return { ok: true, valor: (count ?? 0) > 1 };
}

async function zonaDeLaOrganizacion(supabase: Supabase): Promise<Leida<string | null>> {
  const { data, error } = await supabase.from('organizacion').select('zona_horaria').maybeSingle();
  if (error) {
    console.error('notas: no se pudo leer la organización', error);
    return { ok: false };
  }
  return { ok: true, valor: data?.zona_horaria ?? null };
}

/** `null` si la lectura falla: sin nombres, el autor de cada versión saldría como '' (R2-H6). */
async function nombresDe(supabase: Supabase, ids: string[]): Promise<Map<string, string> | null> {
  const nombres = new Map<string, string>();
  if (ids.length === 0) return nombres;
  const { data, error } = await supabase.from('directorio_perfiles').select('id, nombre_completo').in('id', ids);
  if (error) {
    console.error('notas: no se pudieron leer los nombres', error);
    return null;
  }
  for (const fila of data ?? []) {
    if (fila.id) nombres.set(fila.id, fila.nombre_completo ?? '');
  }
  return nombres;
}

const hexDeBytea = (valor: string) => valor.replace(/^\\x/i, '');

/** «AAAA-MM-DD» → «dd/MM/yyyy», sin pasar por un `Date` (una fecha de calendario no tiene zona). */
function fechaLegible(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

function etiquetaDeEpisodio(modalidad: string, abiertoEn: string, zona: string): string {
  return tCon('notas.episodio', {
    modalidad: t(`notas.modalidad.${modalidad}` as ClaveDeCatalogo),
    fecha: formatearFechaCorta(new Date(abiertoEn), zona),
  });
}

/** El modelo de vista estrecho de §1.4. `null` si la cabecera no se puede leer. */
async function cargarModelo(sesion: Sesion, notaId: string): Promise<ModeloDeNota | null> {
  const { supabase, usuario } = sesion;
  const cab = await leerCabecera(supabase, notaId);
  if (!cab) return null;

  const [{ data: filasVersiones, error: errorVersiones }, episodioLeido, conjuntaLeida] = await Promise.all([
    supabase
      .from('notas_clinicas_versiones')
      .select('numero_version, autor_id, creada_en, motivo_cambio, alcance, cuerpo, anotaciones_reservadas, contenido_canonico, huella')
      .eq('nota_id', notaId)
      .order('numero_version', { ascending: true }),
    leerEpisodio(supabase, cab.episodio_id),
    puedeSerConjunta(supabase, cab.episodio_id),
  ]);
  // Una lectura que falla no es «no hay versiones»: una nota firmada se pintaría como borrador y
  // con candidatos a coprofesional (R2-H6).
  if (errorVersiones || !episodioLeido.ok || !conjuntaLeida.ok) {
    if (errorVersiones) console.error('notas: no se pudieron leer las versiones', errorVersiones);
    return null;
  }
  const versiones = filasVersiones ?? [];
  const episodio = episodioLeido.valor;
  const conjunta = conjuntaLeida.valor;

  // La zona de formato: la de la cita si la hay y, si no, la de la organización (ADR-034).
  let cita: { inicio: string; fin: string; zona_horaria: string } | null = null;
  if (cab.cita_id) {
    const { data, error } = await supabase
      .from('citas')
      .select('inicio, fin, zona_horaria')
      .eq('id', cab.cita_id)
      .maybeSingle();
    if (error) {
      console.error('notas: no se pudo leer la cita', error);
      return null;
    }
    cita = data;
  }
  let zona = cita?.zona_horaria;
  if (!zona) {
    const org = await zonaDeLaOrganizacion(supabase);
    if (!org.ok) return null;
    zona = org.valor ?? 'Europe/Madrid';
  }

  const soyAutor = cab.autor_id === usuario.id;
  const hayBorrador = cab.borrador_contenido !== null && cab.borrador_contenido !== undefined;
  const parseado = hayBorrador ? esquemaBorrador.safeParse(cab.borrador_contenido) : null;

  // Candidatos a coprofesional: la misma regla que el disparador de T-034, que es quien manda.
  let candidatos: { id: string; nombre: string }[] = [];
  if (soyAutor && versiones.length === 0 && episodio?.centroId) {
    const { data: enCentro } = await supabase
      .from('perfiles_centros')
      .select('perfil_id')
      .eq('centro_id', episodio.centroId)
      .is('hasta', null);
    const ids = (enCentro ?? []).map((f) => f.perfil_id).filter((id) => id !== usuario.id);
    if (ids.length > 0) {
      const { data: dir } = await supabase
        .from('directorio_perfiles')
        .select('id, nombre_completo, rol, estado')
        .in('id', ids)
        .in('rol', [...ROLES_COPROFESIONAL])
        .eq('estado', 'activo');
      candidatos = (dir ?? []).flatMap((f) =>
        f.id ? [{ id: f.id, nombre: f.nombre_completo ?? '' }] : [],
      );
    }
  }

  const nombres = await nombresDe(supabase, [
    ...new Set([...versiones.map((v) => v.autor_id), ...(cab.coprofesional_id ? [cab.coprofesional_id] : [])]),
  ]);
  if (!nombres) return null;

  const vista: VersionDeVista[] = versiones.map((v) => {
    let texto = '';
    try {
      texto = (JSON.parse(v.cuerpo) as { texto?: string }).texto ?? '';
    } catch {
      texto = '';
    }
    const firmada = new Date(v.creada_en);
    return {
      numero: v.numero_version,
      autor: nombres.get(v.autor_id) ?? '',
      firmadaEn: `${formatearFechaCorta(firmada, zona)} ${formatearHora(firmada, zona)}`,
      motivo: v.motivo_cambio,
      alcance: v.alcance,
      texto,
      reservadas: v.anotaciones_reservadas,
      sello: fraseDelSello(leerSello(v.contenido_canonico), zona),
      huellaCorta: hexDeBytea(v.huella).slice(0, 12),
    };
  });

  return {
    notaId,
    soyAutor,
    estado: estadoDeNota({ versiones: versiones.length, hayBorrador }),
    cabecera: {
      fechaSesion: fechaLegible(cab.fecha_sesion),
      horario: cita ? formatearRango(new Date(cita.inicio), new Date(cita.fin), zona) : null,
      episodio: episodio ? etiquetaDeEpisodio(episodio.modalidad, episodio.abiertoEn, zona) : '',
      coprofesional: cab.coprofesional_id
        ? { id: cab.coprofesional_id, nombre: nombres.get(cab.coprofesional_id) ?? '' }
        : null,
    },
    borrador:
      hayBorrador && cab.borrador_actualizado_en && parseado?.success
        ? {
            texto: parseado.data.texto,
            reservadas: parseado.data.reservadas,
            testigo: cab.borrador_actualizado_en,
          }
        : null,
    versiones: vista,
    candidatosCoprofesional: candidatos,
    puedeSerConjunta: conjunta,
  };
}

/**
 * Las cero filas de un `update` condicionado (tabla de §1.5). Una relectura distingue el
 * candado cerrado, otro autor, otro paciente, la falta de borrador y el conflicto real. Cuando
 * no hay testigo que cotejar (`fijarCoprofesional`, `empezarModificacion`) no se prueba.
 */
async function diagnosticarCeroFilas(
  supabase: Supabase,
  usuarioId: string,
  pacienteId: string,
  notaId: string,
  testigo: string | null,
): Promise<MotivoFallo> {
  const { data } = await supabase
    .from('notas_clinicas')
    .select('id, paciente_id, autor_id, borrador_actualizado_en')
    .eq('id', notaId)
    .maybeSingle();
  if (!data) return 'bloqueada';
  if (data.paciente_id !== pacienteId) return 'no_disponible';
  if (data.autor_id !== usuarioId) return 'no_autor';
  if (testigo !== null) {
    if (data.borrador_actualizado_en === null) return 'sin_borrador';
    if (data.borrador_actualizado_en !== testigo) return 'conflicto';
  }
  return 'error';
}

// ---------------------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------------------

export async function abrirEditorDeNota(
  sesion: Sesion,
  entrada: { pacienteId: string; citaId: string | null; notaId: string | null; episodioId: string | null },
  contexto: Contexto,
): Promise<ResultadoApertura> {
  const { supabase, usuario } = sesion;

  // 1 · El acceso se registra ANTES de tocar ninguna tabla clínica (ADR-058.2).
  const acceso = await registrarAccesoHistoria(sesion, entrada.pacienteId, 'notas_clinicas', contexto);
  if (!acceso.ok) return { estado: 'bloqueada' };

  // Cita XOR nota. Con `notaId` se ABRE cualquier nota visible, también las que no tienen cita
  // (las sembradas); lo que no se puede desde aquí es CREAR una nota sin cita: no hay de dónde
  // sacar su fecha (R2-H9).
  if ((entrada.citaId === null) === (entrada.notaId === null)) return { estado: 'no_disponible' };

  const devolver = async (notaId: string): Promise<ResultadoApertura> => {
    const nota = await cargarModelo(sesion, notaId);
    if (!nota) return { estado: 'no_disponible' };
    const caducaEn = await prolongarDesbloqueo(sesion);
    return { estado: 'abierta', caducaEn, nota };
  };

  // 2 · Con nota: la cabecera tiene que verse (RLS) y ser de este paciente.
  if (entrada.notaId) {
    const cab = await leerCabecera(supabase, entrada.notaId);
    if (!cab || cab.paciente_id !== entrada.pacienteId) return { estado: 'no_disponible' };
    return devolver(cab.id);
  }

  // 3 · Con cita: tiene que ser de este paciente y de este profesional.
  const citaId = entrada.citaId!;
  const { data: cita } = await supabase
    .from('citas')
    .select('id, paciente_id, profesional_id, inicio, fin, zona_horaria')
    .eq('id', citaId)
    .maybeSingle();
  if (!cita || cita.paciente_id !== entrada.pacienteId || cita.profesional_id !== usuario.id) {
    return { estado: 'no_disponible' };
  }

  const buscarPorCita = async () => {
    const { data } = await supabase
      .from('notas_clinicas')
      .select('id')
      .eq('cita_id', citaId)
      .eq('autor_id', usuario.id)
      // Del paciente que se abre: una nota de otro paciente con el `cita_id` de esta cita
      // (H27 sigue abierto) registraría el acceso a nombre de uno y devolvería la de otro (R2-H8).
      .eq('paciente_id', entrada.pacienteId)
      .maybeSingle();
    return data?.id ?? null;
  };

  const existente = await buscarPorCita();
  if (existente) return devolver(existente);

  // 4 · Sin cabecera: el episodio lo decide la base.
  const { data: episodioId, error: errorEpisodio } = await supabase.rpc('episodio_para_nota', {
    p_paciente_id: entrada.pacienteId,
    p_cita_id: citaId,
    ...(entrada.episodioId ? { p_episodio_id: entrada.episodioId } : {}),
  });
  if (errorEpisodio) {
    if (errorEpisodio.code === 'EP001') {
      // La MISMA regla que cuenta `episodio_para_nota` (R2-H3): abiertos del profesional con el
      // paciente de titular O de participante en alta. Si la lista fuera más corta que el recuento,
      // quien elige no podría llegar al episodio que le falta.
      const { data: comoTitular, error: errorTitular } = await supabase
        .from('episodios_asistenciales')
        .select('id, modalidad_relacional, abierto_en')
        .eq('paciente_id', entrada.pacienteId)
        .eq('profesional_id', usuario.id)
        .is('cerrado_en', null);
      const { data: participaciones, error: errorParticipaciones } = await supabase
        .from('episodio_participantes')
        .select('episodio_id')
        .eq('paciente_id', entrada.pacienteId)
        .is('baja_en', null);
      if (errorTitular || errorParticipaciones) {
        console.error('notas: no se pudieron listar los episodios', errorTitular ?? errorParticipaciones);
        return { estado: 'error' };
      }
      const idsParticipados = (participaciones ?? []).map((f) => f.episodio_id);
      let comoParticipante: typeof comoTitular = [];
      if (idsParticipados.length > 0) {
        const { data, error } = await supabase
          .from('episodios_asistenciales')
          .select('id, modalidad_relacional, abierto_en')
          .in('id', idsParticipados)
          .eq('profesional_id', usuario.id)
          .is('cerrado_en', null);
        if (error) {
          console.error('notas: no se pudieron listar los episodios', error);
          return { estado: 'error' };
        }
        comoParticipante = data;
      }
      const vistos = new Set<string>();
      const abiertos = [...(comoTitular ?? []), ...(comoParticipante ?? [])].filter((e) => {
        if (vistos.has(e.id)) return false;
        vistos.add(e.id);
        return true;
      });
      return {
        estado: 'elegir_episodio',
        episodios: abiertos.map((e) => ({
          id: e.id,
          etiqueta: etiquetaDeEpisodio(e.modalidad_relacional, e.abierto_en, cita.zona_horaria),
        })),
      };
    }
    console.error('notas: episodio_para_nota falló', errorEpisodio);
    return { estado: 'error' };
  }
  if (!episodioId) return { estado: 'no_disponible' };

  // Con esto queda fijada `abierta_en` (la pone el disparador, no el cliente).
  const { data: nueva, error: errorAlta } = await supabase
    .from('notas_clinicas')
    .insert({
      paciente_id: entrada.pacienteId,
      episodio_id: episodioId,
      autor_id: usuario.id,
      cita_id: citaId,
      fecha_sesion: fechaDeSesion(new Date(cita.inicio), cita.zona_horaria),
      borrador_contenido: { texto: '', reservadas: '' },
      borrador_autor_id: usuario.id,
    })
    .select('id')
    .single();

  if (errorAlta) {
    // 23505: otra apertura de la misma cita entró primero (índice cita+autor). Se relee.
    if (errorAlta.code === '23505') {
      const id = await buscarPorCita();
      return id ? devolver(id) : { estado: 'error' };
    }
    console.error('notas: no se pudo crear la cabecera', errorAlta);
    return { estado: 'error' };
  }
  return devolver(nueva.id);
}

export async function guardarBorrador(
  sesion: Sesion,
  entrada: { pacienteId: string; notaId: string; testigo: string; texto: string; reservadas: string },
): Promise<ResultadoGuardado> {
  const { supabase, usuario } = sesion;

  // El testigo viaja como la cadena que dio la base: sin `Date` por medio.
  const { data, error } = await supabase
    .from('notas_clinicas')
    .update({
      borrador_contenido: { texto: entrada.texto, reservadas: entrada.reservadas },
      borrador_autor_id: usuario.id,
    })
    .eq('id', entrada.notaId)
    .eq('paciente_id', entrada.pacienteId)
    .eq('borrador_actualizado_en', entrada.testigo)
    .select('borrador_actualizado_en');

  if (error) {
    console.error('notas: no se pudo guardar el borrador', error);
    return { ok: false, motivo: 'error' };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      motivo: await diagnosticarCeroFilas(supabase, usuario.id, entrada.pacienteId, entrada.notaId, entrada.testigo),
    };
  }

  const testigo = data[0]!.borrador_actualizado_en;
  if (!testigo) return { ok: false, motivo: 'error' };
  // No registra acceso: guardar no es abrir (hecho 14).
  const caducaEn = await prolongarDesbloqueo(sesion);
  return { ok: true, testigo, caducaEn };
}

export async function fijarCoprofesional(
  sesion: Sesion,
  entrada: { pacienteId: string; notaId: string; coprofesionalId: string | null },
): Promise<ResultadoDeNota> {
  const { supabase, usuario } = sesion;

  const { data, error } = await supabase
    .from('notas_clinicas')
    .update({ coprofesional_id: entrada.coprofesionalId })
    .eq('id', entrada.notaId)
    .eq('paciente_id', entrada.pacienteId)
    .select('id');

  if (error) {
    // 23514: T-034 (esa persona no puede figurar como coprofesional en este centro).
    if (error.code === '23514') return { ok: false, motivo: 'coprofesional_invalido' };
    // 42501: la congelación de la cabecera (ya hay versiones).
    if (error.code === '42501') return { ok: false, motivo: 'ya_firmada' };
    console.error('notas: no se pudo fijar el coprofesional', error);
    return { ok: false, motivo: 'error' };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      motivo: await diagnosticarCeroFilas(supabase, usuario.id, entrada.pacienteId, entrada.notaId, null),
    };
  }

  const caducaEn = await prolongarDesbloqueo(sesion);
  return { ok: true, nota: await cargarModelo(sesion, entrada.notaId), caducaEn };
}

export async function empezarModificacion(
  sesion: Sesion,
  entrada: { pacienteId: string; notaId: string },
): Promise<ResultadoDeNota> {
  const { supabase, usuario } = sesion;

  // La versión vigente: de ella sale el borrador de partida.
  const { data: ultimas } = await supabase
    .from('notas_clinicas_versiones')
    .select('numero_version, cuerpo, anotaciones_reservadas')
    .eq('nota_id', entrada.notaId)
    .order('numero_version', { ascending: false })
    .limit(1);
  const vigente = ultimas?.[0];
  // Sin versión no hay nada que modificar: se escribe, no se modifica.
  if (!vigente) return { ok: false, motivo: 'no_disponible' };

  let texto = '';
  try {
    texto = (JSON.parse(vigente.cuerpo) as { texto?: string }).texto ?? '';
  } catch {
    return { ok: false, motivo: 'error' };
  }

  // Solo si no hay borrador: no se pisa uno vivo. Con esto se fija la `abierta_en` de la
  // versión siguiente.
  const { data, error } = await supabase
    .from('notas_clinicas')
    .update({
      borrador_contenido: { texto, reservadas: vigente.anotaciones_reservadas ?? '' },
      borrador_autor_id: usuario.id,
    })
    .eq('id', entrada.notaId)
    .eq('paciente_id', entrada.pacienteId)
    .is('borrador_contenido', null)
    .select('id');

  if (error) {
    console.error('notas: no se pudo empezar la modificación', error);
    return { ok: false, motivo: 'error' };
  }
  if (!data || data.length === 0) {
    const motivo = await diagnosticarCeroFilas(supabase, usuario.id, entrada.pacienteId, entrada.notaId, null);
    // 'error' aquí significa «la fila existe, es mía y no se actualizó»: ya había borrador.
    // Se devuelve tal cual, sin pisarlo.
    if (motivo !== 'error') return { ok: false, motivo };
  }

  const caducaEn = await prolongarDesbloqueo(sesion);
  return { ok: true, nota: await cargarModelo(sesion, entrada.notaId), caducaEn };
}

export async function firmarNota(
  sesion: Sesion,
  entrada: {
    pacienteId: string;
    notaId: string;
    testigo: string;
    alcance: 'individual' | 'conjunta';
    motivo: string | null;
  },
): Promise<ResultadoDeNota> {
  const { supabase, usuario } = sesion;
  const fallo = (motivo: MotivoFallo): ResultadoDeNota => ({ ok: false, motivo });

  // 2 · Se relee la cabecera: de ahí sale todo lo que se sella, nunca del formulario.
  const cab = await leerCabecera(supabase, entrada.notaId);
  if (!cab) return fallo('bloqueada');
  if (cab.autor_id !== usuario.id) return fallo('no_autor');
  if (cab.paciente_id !== entrada.pacienteId) return fallo('no_disponible');
  if (cab.borrador_contenido === null || cab.borrador_contenido === undefined) return fallo('sin_borrador');
  if (cab.borrador_actualizado_en !== entrada.testigo) return fallo('conflicto');

  // 3 · Se firma LO GUARDADO.
  const borrador = esquemaBorrador.safeParse(cab.borrador_contenido);
  if (!borrador.success) return fallo('error');
  const { texto, reservadas } = borrador.data;
  if (texto.trim() === '') return fallo('vacia');

  // 4 · La cita y el margen. Si no se pueden leer se ABORTA: firmar «sin cita» lo que sí tenía
  // cita sería sellar una falsedad (§2.4).
  let ventanaCita: { inicio: Date; fin: Date } | null = null;
  let margenMinutos: number | null = null;
  if (cab.cita_id) {
    // Un error de lectura NO es «no hay dato»: aquí se decide lo que se sella para siempre
    // (R2-H2). Solo un `data` nulo SIN error significa «hereda» / «no admite».
    const { data: cita, error: errorCita } = await supabase
      .from('citas')
      .select('inicio, fin, centro_id')
      .eq('id', cab.cita_id)
      .maybeSingle();
    if (errorCita) {
      console.error('notas: no se pudo leer la cita', errorCita);
      return fallo('error');
    }
    if (!cita) return fallo('cita_ilegible');
    ventanaCita = { inicio: new Date(cita.inicio), fin: new Date(cita.fin) };

    if (cita.centro_id) {
      const { data: centro, error: errorCentro } = await supabase
        .from('centros')
        .select('margen_sesion_minutos')
        .eq('id', cita.centro_id)
        .maybeSingle();
      if (errorCentro) {
        console.error('notas: no se pudo leer el margen del centro', errorCentro);
        return fallo('error');
      }
      margenMinutos = centro?.margen_sesion_minutos ?? null;
    }
    if (margenMinutos === null) {
      const { data: organizacion, error: errorOrganizacion } = await supabase
        .from('organizacion')
        .select('margen_sesion_minutos')
        .maybeSingle();
      if (errorOrganizacion) {
        console.error('notas: no se pudo leer el margen de la organización', errorOrganizacion);
        return fallo('error');
      }
      margenMinutos = organizacion?.margen_sesion_minutos ?? null;
    }
    if (margenMinutos === null) return fallo('cita_ilegible');
  }

  // 5 · El motivo: obligatorio desde la segunda versión, y se comprueba SIN insertar.
  const { count, error: errorCuenta } = await supabase
    .from('notas_clinicas_versiones')
    .select('id', { count: 'exact', head: true })
    .eq('nota_id', entrada.notaId);
  // Sin el recuento no se sabe si esto es una v1 o una modificación: no se sigue (R2-H7).
  if (errorCuenta || count === null) {
    console.error('notas: no se pudieron contar las versiones', errorCuenta);
    return fallo('error');
  }
  const versiones = count;
  const motivo = entrada.motivo?.trim() ? entrada.motivo.trim() : null;
  if (versiones > 0 && motivo === null) return fallo('falta_motivo');

  // 6 · La conjunta solo cuenta si el episodio la admite. Si no se puede saber, no se sella.
  const conjunta = await puedeSerConjunta(supabase, cab.episodio_id);
  if (!conjunta.ok) return fallo('error');
  const alcance = conjunta.valor ? entrada.alcance : 'individual';

  // 7 · Sellar. El sobre sale de la cabecera y del borrador releídos.
  try {
    await firmarVersionNota(supabase, {
      notaId: cab.id,
      pacienteId: cab.paciente_id,
      episodioId: cab.episodio_id,
      fechaSesion: cab.fecha_sesion,
      coprofesionalId: cab.coprofesional_id,
      autorId: usuario.id,
      cuerpo: { texto },
      anotacionesReservadas: reservadas === '' ? null : reservadas,
      motivoCambio: versiones > 0 ? motivo : null,
      alcance,
      citaId: cab.cita_id,
      ventanaCita,
      margenMinutos,
      abiertaEn: new Date(cab.borrador_abierta_en ?? cab.borrador_actualizado_en),
    });
  } catch (e) {
    if (!(e instanceof ErrorFirmaVersion)) throw e;
    if (e.codigo === '42501') {
      const sigueVisible = await leerCabecera(supabase, entrada.notaId);
      return fallo(sigueVisible ? 'no_disponible' : 'bloqueada');
    }
    // 6.8 (abierta_en posterior a firmada_en: desfase de reloj) NO es un conflicto: «vuelve a
    // intentarlo», sin ajustar ninguna fecha (§4.6 del diseño; R2-H7).
    if (e.codigo === '23514' && e.message.includes('abierta_en')) return fallo('error');
    // 23514: la cabecera cambió entre leerla y firmar. 23505: otra firma entró antes.
    // No se reintenta en silencio: quien firma tiene que saberlo.
    if (e.codigo === '23514' || e.codigo === '23505') return fallo('conflicto');
    console.error('notas: la firma falló', e);
    return fallo('error');
  }

  // 8 · El disparador selló y encadenó; vaciar_borrador_al_firmar y la resolución de la alerta
  // ocurrieron en la misma transacción.
  const caducaEn = await prolongarDesbloqueo(sesion);
  return { ok: true, nota: await cargarModelo(sesion, entrada.notaId), caducaEn };
}
