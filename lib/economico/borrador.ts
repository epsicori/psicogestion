import 'server-only';

// T-046 · El núcleo del editor del borrador (diseño §1.4). Inyectable: la Server Action le pasa la
// sesión y el reloj; las pruebas, un supabase falso o una sesión real.
//
// Todo se lee con la RLS de quien actúa. Las comprobaciones de aquí dan el mensaje sin llegar a la
// base; las que mandan están en la base (sellado de T-021, congelación de T-026a y el disparador
// `validar_citas_version_borrador` de T-046). Nada de lo que se registra lleva la entrada: el NIF
// solo existe en claro dentro de este proceso, entre Zod y `cifrarNif`.
import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { descifrarIdentificacion, type FilaIdentificacion } from '@/lib/cifrado/identificacion';
import type { RegimenIva } from '@/lib/dinero/iva';
import type { Database } from '@/lib/supabase/tipos-bd';

import { arrastrarNif, cifrarNif } from './destinatario';
import { esquemaEntradaGuardar, type EntradaGuardar, type ResultadoGuardar } from './entrada';
import { calcularImportes, ErrorCuotaMinima } from './importes';
import { fechaLocal, proponerLinea, type TarifaLeida } from './precio';
import { construirSobreBorrador } from './sobre-borrador';
import { tipoIvaDe, type LineaBorrador, type NifCifrado } from './tipos';

export type DepsBorrador = {
  supabase: SupabaseClient<Database>;
  usuario: { id: string };
  ahora: () => Date;
  claveDeCifrado: () => Promise<Buffer>;
  /** El nombre del programa de facturación activo, para el mensaje de «congelado». */
  proveedor: () => string | null;
};

type Paciente = { id: string; nombre: string; apellidos: string; profesional_id: string; centro_id: string | null };

type VersionLeida = {
  borrador_id: string;
  numero_version: number;
  descartado: boolean;
  destinatario_nombre: string;
  destinatario_nif_cifrado: string | null;
  destinatario_nif_nonce: string | null;
  destinatario_nif_etiqueta: string | null;
  lineas: LineaBorrador[];
};

const COLUMNAS_VERSION =
  'borrador_id, numero_version, descartado, destinatario_nombre, destinatario_nif_cifrado, ' +
  'destinatario_nif_nonce, destinatario_nif_etiqueta, lineas';

const NO_DISPONIBLE: ResultadoGuardar = { ok: false, error: 'no_disponible' };

class Corte extends Error {
  constructor(readonly resultado: ResultadoGuardar) {
    super(resultado.ok ? 'ok' : resultado.error);
  }
}

/** Un fallo de lectura no se traduce a «no disponible»: se registra (sin datos) y es `no_guardado`. */
function fallo(donde: string, error: { code?: string; message?: string }): never {
  console.error(`guardarBorrador: ${donde}`, error.code ?? 'sin código', error.message ?? '');
  throw new Corte({ ok: false, error: 'no_guardado' });
}

// ── Lecturas compartidas por el núcleo y la pantalla ──────────────────────────────────────

async function leerRol(supabase: DepsBorrador['supabase']) {
  const { data, error } = await supabase.rpc('rol_actual');
  if (error) fallo('rol_actual', error);
  return data ?? null;
}

/** El paciente visible y atendible por quien actúa, o `null`: el técnico y el no asignado, nada. */
async function leerPacienteAtendible(deps: DepsBorrador, pacienteId: string) {
  const rol = await leerRol(deps.supabase);
  if (rol !== 'administrador' && rol !== 'profesional_sanitario') return null;
  const { data, error } = await deps.supabase
    .from('pacientes')
    .select('id, nombre, apellidos, profesional_id, centro_id')
    .eq('id', pacienteId)
    .maybeSingle();
  if (error) fallo('pacientes', error);
  if (!data) return null;
  if (rol !== 'administrador' && data.profesional_id !== deps.usuario.id) return null;
  return { rol, paciente: data as Paciente };
}

/**
 * El profesional de la cabecera de un borrador de este paciente, o `null` si no se ve, es de otro
 * paciente o quien actúa no puede tocarlo. Un borrador existente es SIEMPRE de su cabecera, aunque
 * el administrador haya reasignado después al paciente: el sellado de T-021 coteja el sobre con
 * ella, y el disparador de citas de T-046 también. Como la política de alta de versiones, el
 * profesional tiene que ser el de la cabecera y además seguir atendiendo al paciente (eso último
 * ya lo exige `leerPacienteAtendible`).
 */
async function leerProfesionalDelBorrador(
  deps: DepsBorrador,
  atendible: { rol: string; paciente: Paciente },
  borradorId: string,
): Promise<string | null> {
  const { data: cabecera, error } = await deps.supabase
    .from('borradores_factura')
    .select('id, paciente_id, profesional_id')
    .eq('id', borradorId)
    .maybeSingle();
  if (error) fallo('borradores_factura', error);
  if (!cabecera || cabecera.paciente_id !== atendible.paciente.id) return null;
  if (atendible.rol !== 'administrador' && cabecera.profesional_id !== deps.usuario.id) return null;
  return cabecera.profesional_id;
}

async function leerUltimaVersion(deps: DepsBorrador, borradorId: string) {
  const { data, error } = await deps.supabase
    .from('borradores_factura_versiones')
    .select(COLUMNAS_VERSION)
    .eq('borrador_id', borradorId)
    .order('numero_version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fallo('borradores_factura_versiones', error);
  return (data as unknown as VersionLeida | null) ?? null;
}

/**
 * Las citas que van en la última versión NO descartada de cada borrador del paciente: un borrador
 * vivo. La última de cada uno, no cualquiera: una cita que se quitó en la v3 queda libre.
 */
async function citasEnBorradoresVivos(deps: DepsBorrador, pacienteId: string) {
  const { data, error } = await deps.supabase
    .from('borradores_factura_versiones')
    .select('borrador_id, numero_version, descartado, lineas')
    .eq('paciente_id', pacienteId);
  if (error) fallo('versiones del paciente', error);
  const ultima = new Map<string, { numero_version: number; descartado: boolean; lineas: LineaBorrador[] }>();
  for (const v of (data ?? []) as unknown as VersionLeida[]) {
    const previa = ultima.get(v.borrador_id);
    if (!previa || v.numero_version > previa.numero_version) ultima.set(v.borrador_id, v);
  }
  const enBorrador = new Map<string, string>();
  for (const [borradorId, v] of ultima) {
    if (v.descartado) continue;
    for (const l of v.lineas ?? []) if (l.cita_id) enBorrador.set(l.cita_id, borradorId);
  }
  return enBorrador;
}

// ── guardarBorrador ────────────────────────────────────────────────────────────────────────

function traducir(error: { code?: string; message?: string }, deps: DepsBorrador): ResultadoGuardar {
  const codigo = error.code ?? '';
  const mensaje = error.message ?? '';
  if (codigo === '42501') return NO_DISPONIBLE;
  if (codigo === '23505' && mensaje.includes('borradores_factura_versiones_numero_uq')) {
    return { ok: false, error: 'conflicto' };
  }
  if (codigo === '23514') {
    if (mensaje.includes('no atiende a ese paciente')) return NO_DISPONIBLE;
    if (mensaje.includes('ya se preparó en el programa')) {
      const programa = deps.proveedor();
      return programa ? { ok: false, error: 'congelado', programa } : { ok: false, error: 'congelado' };
    }
    if (mensaje.includes('numero_version del sobre no es')) return { ok: false, error: 'conflicto' };
    if (mensaje.includes('ya está en otro borrador sin descartar')) {
      return { ok: false, error: 'cita_en_otro_borrador' };
    }
    if (
      mensaje.includes('no está realizada (T-046') ||
      mensaje.includes('no es del profesional del borrador (T-046') ||
      mensaje.includes('va en un bono (T-046') ||
      mensaje.includes('aparece dos veces en el borrador (T-046')
    ) {
      return { ok: false, error: 'cita_no_elegible' };
    }
  }
  console.error('guardarBorrador: la base rechazó la versión', codigo, mensaje);
  return { ok: false, error: 'no_guardado' };
}

async function comprobarCitas(
  deps: DepsBorrador,
  paciente: Paciente,
  profesionalId: string,
  borradorId: string | null,
  lineas: LineaBorrador[],
): Promise<ResultadoGuardar | null> {
  const ids = lineas.flatMap((l) => (l.cita_id ? [l.cita_id] : []));
  if (ids.length === 0) return null;

  const repetidas = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repetidas.length > 0) {
    return { ok: false, error: 'cita_no_elegible', citas: [...new Set(repetidas)] };
  }

  const { data, error } = await deps.supabase
    .from('citas')
    .select('id, paciente_id, profesional_id, estado, bono_id')
    .in('id', ids);
  if (error) fallo('citas', error);
  const porId = new Map((data ?? []).map((c) => [c.id, c]));
  const noElegibles = ids.filter((id) => {
    const c = porId.get(id);
    return (
      !c ||
      c.paciente_id !== paciente.id ||
      c.estado !== 'realizada' ||
      c.profesional_id !== profesionalId ||
      c.bono_id !== null
    );
  });
  if (noElegibles.length > 0) return { ok: false, error: 'cita_no_elegible', citas: noElegibles };

  const vivas = await citasEnBorradoresVivos(deps, paciente.id);
  const enOtro = ids.filter((id) => {
    const de = vivas.get(id);
    return de !== undefined && de !== borradorId;
  });
  if (enOtro.length > 0) return { ok: false, error: 'cita_en_otro_borrador', citas: enOtro };
  return null;
}

async function nifDelPaciente(deps: DepsBorrador, pacienteId: string): Promise<NifCifrado> {
  const { data, error } = await deps.supabase.rpc('leer_identificacion', { p_paciente_id: pacienteId });
  if (error) {
    if (error.code === '42501') throw new Corte(NO_DISPONIBLE);
    fallo('leer_identificacion', error);
  }
  const fila = (data as unknown as FilaIdentificacion[] | null)?.[0];
  if (!fila) return null;
  const { documento } = await descifrarIdentificacion(fila);
  if (!documento) return null;
  return cifrarNif(await deps.claveDeCifrado(), documento);
}

export async function guardarBorrador(deps: DepsBorrador, datos: unknown): Promise<ResultadoGuardar> {
  try {
    return await guardar(deps, datos);
  } catch (e) {
    if (e instanceof Corte) return e.resultado;
    console.error('guardarBorrador: fallo inesperado', e instanceof Error ? e.name : 'desconocido');
    return { ok: false, error: 'no_guardado' };
  }
}

async function guardar(deps: DepsBorrador, datos: unknown): Promise<ResultadoGuardar> {
  // 1 · Zod, otra vez: la acción ya validó, pero el núcleo no se fía de quien lo llama.
  const parseo = esquemaEntradaGuardar.safeParse(datos);
  if (!parseo.success) return { ok: false, error: 'validacion' };
  const entrada: EntradaGuardar = parseo.data;

  // 2 y 3 · Rol y paciente, con la RLS de quien actúa.
  const atendible = await leerPacienteAtendible(deps, entrada.pacienteId);
  if (!atendible) return NO_DISPONIBLE;
  const { paciente } = atendible;

  // 4 · Corregir: la última versión, viva y la misma de la que se partió. El profesional es el de
  // la cabecera si el borrador existe y, al crearlo, el que hoy atiende al paciente.
  let anterior: VersionLeida | null = null;
  let profesionalId = paciente.profesional_id;
  if (entrada.borradorId !== null) {
    const delBorrador = await leerProfesionalDelBorrador(deps, atendible, entrada.borradorId);
    if (!delBorrador) return NO_DISPONIBLE;
    profesionalId = delBorrador;
    anterior = await leerUltimaVersion(deps, entrada.borradorId);
    if (!anterior) return NO_DISPONIBLE;
    if (anterior.descartado) return { ok: false, error: 'descartado' };
    if (anterior.numero_version !== entrada.partida) return { ok: false, error: 'conflicto' };
  }

  // Un descarte conserva destinatario y líneas: solo cambia la marca.
  const lineas: LineaBorrador[] =
    entrada.descartar && anterior
      ? anterior.lineas
      : entrada.lineas.map((l) => ({
          concepto: l.concepto,
          cantidad: l.cantidad,
          precio_unitario_centimos: l.precio_centimos,
          regimen_iva: l.regimen_iva,
          tipo_iva_centesimas: tipoIvaDe(l.regimen_iva),
          cita_id: l.cita_id,
        }));

  // 5 · Las citas de todas las líneas (D9). Descartar siempre se puede (D5).
  if (!entrada.descartar) {
    const rechazo = await comprobarCitas(deps, paciente, profesionalId, entrada.borradorId, lineas);
    if (rechazo) return rechazo;
  }

  // 6 · El destinatario.
  const modo = entrada.descartar ? 'conservar' : entrada.destinatario.modo;
  let destinatarioNombre: string;
  let nif: NifCifrado;
  if (modo === 'conservar') {
    if (!anterior) return { ok: false, error: 'validacion' };
    destinatarioNombre = anterior.destinatario_nombre;
    nif = arrastrarNif({
      cifrado: anterior.destinatario_nif_cifrado,
      nonce: anterior.destinatario_nif_nonce,
      etiqueta: anterior.destinatario_nif_etiqueta,
    });
  } else if (entrada.destinatario.modo === 'tercero') {
    destinatarioNombre = entrada.destinatario.nombre;
    nif = entrada.destinatario.nif === null ? null : cifrarNif(await deps.claveDeCifrado(), entrada.destinatario.nif);
  } else {
    destinatarioNombre = `${paciente.nombre} ${paciente.apellidos}`.trim();
    nif = await nifDelPaciente(deps, paciente.id);
  }

  // 7 · Importes en céntimos.
  let importes: ReturnType<typeof calcularImportes>;
  try {
    importes = calcularImportes(lineas);
  } catch (e) {
    if (e instanceof ErrorCuotaMinima) return { ok: false, error: 'cuota_minima' };
    throw e;
  }

  // 8 · El sobre, con la entrada normalizada una sola vez (NFC, uuid en minúsculas).
  const borradorId = entrada.borradorId ?? randomUUID();
  const { contenidoCanonico, normalizada } = construirSobreBorrador({
    borradorId,
    numeroVersion: anterior ? anterior.numero_version + 1 : 1,
    pacienteId: paciente.id,
    profesionalId,
    centroId: paciente.centro_id,
    creadaPor: deps.usuario.id,
    creadaEn: deps.ahora(),
    descartado: entrada.descartar,
    destinatarioNombre,
    nif,
    lineas,
    baseCentimos: importes.base,
    cuotaCentimos: importes.cuota,
    totalCentimos: importes.total,
  });

  // 9 · Una sola RPC. El generador no modela los `null` que la función acepta en el NIF ni en el
  // centro (como `zona_horaria_centro` en `app/(app)/facturacion/datos.ts`).
  const comunes = {
    p_centro_id: normalizada.centroId as string,
    p_destinatario_nombre: normalizada.destinatarioNombre,
    p_nif_cifrado: (normalizada.nif?.cifrado ?? null) as string,
    p_nif_nonce: (normalizada.nif?.nonce ?? null) as string,
    p_nif_etiqueta: (normalizada.nif?.etiqueta ?? null) as string,
    p_lineas: normalizada.lineas,
    p_base_centimos: normalizada.baseCentimos,
    p_cuota_centimos: normalizada.cuotaCentimos,
    p_total_centimos: normalizada.totalCentimos,
    p_creada_en: normalizada.creadaEn.toISOString(),
    p_contenido_canonico: contenidoCanonico,
  };
  const { data, error } =
    entrada.borradorId === null
      ? await deps.supabase.rpc('crear_borrador', {
          p_borrador_id: normalizada.borradorId,
          p_paciente_id: normalizada.pacienteId,
          p_profesional_id: normalizada.profesionalId,
          ...comunes,
        })
      : await deps.supabase.rpc('anadir_version_borrador', {
          p_borrador_id: normalizada.borradorId,
          p_descartado: normalizada.descartado,
          ...comunes,
        });

  // 10 · La traducción de los errores de la base.
  if (error) return traducir(error, deps);
  return { ok: true, borradorId: normalizada.borradorId, numeroVersion: data ?? normalizada.numeroVersion };
}

// ── Lo que pinta el editor ─────────────────────────────────────────────────────────────────

export type EstadoEditable = 'sin_enviar' | 'fallido';
export type EstadoBloqueado = 'en_cola' | 'enviado' | 'facturado' | 'descartado';

export type LineaDeEditor = LineaBorrador & {
  /** Solo en las líneas de sesión: la cita ya no puede ir en un borrador (pasó a bono, etc.). */
  citaNoElegible: boolean;
};

export type DatosEditor = {
  paciente: { id: string; nombreCompleto: string };
  borrador: null | {
    id: string;
    numeroVersion: number;
    estado: EstadoEditable | EstadoBloqueado;
    destinatarioNombre: string;
    /** El NIF guardado nunca sale del servidor: solo si lo hay (D11). */
    tieneNif: boolean;
    lineas: LineaDeEditor[];
    base: number;
    cuota: number;
    total: number;
  };
};

export type SesionElegible = {
  citaId: string;
  /** `AAAA-MM-DD` en la zona de la cita. */
  dia: string;
  concepto: string;
  precioCentimos: number | null;
  regimen: RegimenIva | null;
};

const ESTADOS = ['sin_enviar', 'fallido', 'en_cola', 'enviado', 'facturado', 'descartado'] as const;

/**
 * Lo que necesita la pantalla del editor, o `null` si quien mira no puede preparar borradores de
 * este paciente (técnico, no asignado, paciente invisible) o el borrador no es de este paciente.
 * Nunca devuelve las columnas `destinatario_nif_*`.
 */
export async function cargarEditor(
  deps: DepsBorrador,
  pacienteId: string,
  borradorId?: string,
): Promise<DatosEditor | null> {
  try {
    const atendible = await leerPacienteAtendible(deps, pacienteId);
    if (!atendible) return null;
    const { paciente } = atendible;
    const nombreCompleto = `${paciente.nombre} ${paciente.apellidos}`.trim();
    if (!borradorId) return { paciente: { id: paciente.id, nombreCompleto }, borrador: null };

    const profesionalId = await leerProfesionalDelBorrador(deps, atendible, borradorId);
    if (!profesionalId) return null;
    const ultima = await leerUltimaVersion(deps, borradorId);
    if (!ultima) return null;

    const { data: fila, error } = await deps.supabase
      .from('borradores_factura_estado')
      .select('estado')
      .eq('borrador_id', borradorId)
      .maybeSingle();
    if (error) fallo('borradores_factura_estado', error);
    const bruto = ultima.descartado ? 'descartado' : (fila?.estado ?? 'sin_enviar');
    const estado = (ESTADOS as readonly string[]).includes(bruto)
      ? (bruto as EstadoEditable | EstadoBloqueado)
      : 'sin_enviar';

    const elegibilidad = await elegibilidadDeCitas(deps, paciente, profesionalId, ultima.lineas);
    const importes = calcularImportes(ultima.lineas);
    return {
      paciente: { id: paciente.id, nombreCompleto },
      borrador: {
        id: borradorId,
        numeroVersion: ultima.numero_version,
        estado,
        destinatarioNombre: ultima.destinatario_nombre,
        tieneNif: ultima.destinatario_nif_cifrado !== null,
        lineas: ultima.lineas.map((l) => ({
          ...l,
          citaNoElegible: l.cita_id !== null && !elegibilidad.has(l.cita_id),
        })),
        base: importes.base,
        cuota: importes.cuota,
        total: importes.total,
      },
    };
  } catch (e) {
    if (e instanceof Corte) return null;
    throw e;
  }
}

/** Las citas de las líneas que siguen siendo elegibles (realizada, del profesional del borrador, sin bono). */
async function elegibilidadDeCitas(
  deps: DepsBorrador,
  paciente: Paciente,
  profesionalId: string,
  lineas: LineaBorrador[],
) {
  const ids = lineas.flatMap((l) => (l.cita_id ? [l.cita_id] : []));
  if (ids.length === 0) return new Set<string>();
  const { data, error } = await deps.supabase
    .from('citas')
    .select('id, paciente_id, profesional_id, estado, bono_id')
    .in('id', ids);
  if (error) fallo('citas', error);
  return new Set(
    (data ?? [])
      .filter(
        (c) =>
          c.paciente_id === paciente.id &&
          c.estado === 'realizada' &&
          c.profesional_id === profesionalId &&
          c.bono_id === null,
      )
      .map((c) => c.id),
  );
}

const fechaEspanola = (dia: string) => {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
};

/**
 * Las sesiones que pueden ir en un borrador: realizadas, sin bono, fuera de cualquier borrador vivo y
 * del profesional del borrador (el de su cabecera si ya existe; si es nuevo, el del paciente). Con el precio y el régimen PROPUESTOS (CA8, CA10). El
 * concepto es «Sesión del dd/mm/aaaa»: el nombre del tipo de terapia puede describir el
 * tratamiento (D20).
 */
export async function cargarElegibles(
  deps: DepsBorrador,
  pacienteId: string,
  borradorId?: string,
): Promise<SesionElegible[] | null> {
  try {
    const atendible = await leerPacienteAtendible(deps, pacienteId);
    if (!atendible) return null;
    const { paciente } = atendible;
    const profesionalId = borradorId
      ? await leerProfesionalDelBorrador(deps, atendible, borradorId)
      : paciente.profesional_id;
    if (!profesionalId) return null;

    const [citas, tarifas, vivas] = await Promise.all([
      deps.supabase
        .from('citas')
        .select('id, inicio, zona_horaria, tipo_terapia_id')
        .eq('paciente_id', paciente.id)
        .eq('profesional_id', profesionalId)
        .eq('estado', 'realizada')
        .is('bono_id', null)
        .order('inicio', { ascending: true }),
      deps.supabase
        .from('tarifas_paciente')
        .select('tipo_terapia_id, importe::text, regimen_iva, vigente_desde, orden')
        .eq('paciente_id', paciente.id),
      citasEnBorradoresVivos(deps, paciente.id),
    ]);
    if (citas.error) fallo('citas', citas.error);
    if (tarifas.error) fallo('tarifas_paciente', tarifas.error);

    const libres = (citas.data ?? []).filter((c) => !vivas.has(c.id));
    const tiposIds = [...new Set(libres.flatMap((c) => (c.tipo_terapia_id ? [c.tipo_terapia_id] : [])))];
    const tipos = new Map<string, { tarifa_base: string | null }>();
    if (tiposIds.length > 0) {
      const { data, error } = await deps.supabase
        .from('tipos_terapia')
        .select('id, tarifa_base::text')
        .in('id', tiposIds);
      if (error) fallo('tipos_terapia', error);
      for (const t of (data ?? []) as unknown as { id: string; tarifa_base: string | null }[]) {
        tipos.set(t.id, { tarifa_base: t.tarifa_base });
      }
    }

    const lista = (tarifas.data ?? []) as unknown as TarifaLeida[];
    return libres.map((c) => {
      const dia = fechaLocal(c.inicio, c.zona_horaria);
      const propuesta = proponerLinea(
        { inicio: c.inicio, zona_horaria: c.zona_horaria, tipo_terapia_id: c.tipo_terapia_id },
        lista,
        c.tipo_terapia_id ? (tipos.get(c.tipo_terapia_id) ?? null) : null,
      );
      return {
        citaId: c.id,
        dia,
        concepto: `Sesión del ${fechaEspanola(dia)}`,
        precioCentimos: propuesta.precioCentimos,
        regimen: propuesta.regimen,
      };
    });
  } catch (e) {
    if (e instanceof Corte) return null;
    throw e;
  }
}
