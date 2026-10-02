// T-040 · El contrato entre la base y `lib/exportaciones` (diseño §1.2, más `exportada_por` del
// contrato de la marca de agua) y la proyección pura a la carga v1 (§1.3).
//
// `proyectar` corre en el servidor (D15: las fechas se formatean en la zona de la cita o de la
// organización, nunca en la del ordenador de quien abre la copia) y VUELVE A RECORTAR lo que la
// proyección del paciente no entrega, aunque la base lo traiga (D9): reservadas y canónico
// siempre; cuerpo y motivo del cambio en las versiones conjuntas.
import { z } from 'zod';

import { esZonaHorariaValida, formatearFechaCorta, formatearHora } from '@/lib/fechas';
import { ESQUEMA_VERSION } from '@/lib/huella';
import { t, type ClaveDeCatalogo } from '@/lib/i18n';
import { fraseDelSello, type SelloLeido } from '@/lib/notas/sello';

import {
  ALGORITMO,
  FORMATO,
  FORMATO_VERSION,
  KDF,
  MOTIVOS,
  PROYECCIONES,
  type MotivoExportacion,
  type ProyeccionExportacion,
} from './constantes';

const hex32 = z.string().regex(/^[0-9a-f]{64}$/, 'SHA-256 en hexadecimal, en minúsculas');
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instante = z.iso.datetime({ offset: true });
const ALCANCES = ['individual', 'conjunta'] as const;
const MODALIDADES = ['individual', 'pareja', 'familiar', 'grupo'] as const;
const ROLES = ['profesional_sanitario', 'administrador'] as const;

const esquemaVersionRespuesta = z.object({
  numero_version: z.number().int().positive(),
  alcance: z.enum(ALCANCES),
  autor_nombre: z.string(),
  creada_en: instante,
  huella: hex32,
  huella_anterior: hex32,
  // El subconjunto del sobre (§1.2) o `null` si el canónico no era JSON. Se lee aparte, con
  // `safeParse`: un sello de otra era no tumba la copia, se pinta «ilegible».
  sello: z.unknown().nullable(),
  // Lo que sigue depende de la rama de la proyección (§1.2): ausente si la base no lo entrega.
  motivo_cambio: z.string().nullable().optional(),
  cuerpo: z.string().optional(),
  anotaciones_reservadas: z.string().nullable().optional(),
  contenido_canonico: z.string().optional(),
  participantes: z
    .array(z.object({ nombre: z.string(), apellidos: z.string().nullable(), papel: z.string().nullable() }))
    .optional(),
});

/**
 * La respuesta de `exportar_nota` (§1.2). `z.object` y no estricto a propósito: si la base trae
 * de más, `proyectar` lo vuelve a quitar (D9) en vez de tumbar la copia.
 */
export const esquemaRespuestaExportar = z
  .object({
    exportacion_id: z.uuid(),
    proyeccion: z.enum(PROYECCIONES),
    motivo: z.enum(MOTIVOS).nullable(),
    referencia: z.string().nullable(),
    generada_en: instante,
    zona: z.string().refine(esZonaHorariaValida, 'Zona IANA'),
    // Literales iguales a constantes.ts: si la base y el código discrepan, la copia no se hace.
    cifrado: z.object({
      formato_version: z.literal(FORMATO_VERSION),
      algoritmo: z.literal(ALGORITMO),
      kdf: z.object({
        m: z.literal(KDF.m),
        t: z.literal(KDF.t),
        p: z.literal(KDF.p),
        longitud: z.literal(KDF.longitud),
      }),
    }),
    paciente: z.object({ id: z.uuid(), nombre: z.string(), apellidos: z.string() }),
    nota: z.object({ id: z.uuid(), fecha_sesion: fechaIso, modalidad: z.enum(MODALIDADES) }),
    exportada_por: z.object({
      nombre: z.string().min(1),
      // `perfiles` solo tiene `nombre_completo`: la base puede mandarlo entero en `nombre` y
      // `apellidos` vacío (hallazgo del corte A).
      apellidos: z.string(),
      rol: z.enum(ROLES),
    }),
    versiones: z.array(esquemaVersionRespuesta).min(1),
  })
  .refine((r) => (r.proyeccion === 'paciente') === (r.motivo === 'peticion_paciente'), {
    message: 'La proyección del paciente va con «petición del paciente», y solo con ella',
    path: ['proyeccion'],
  })
  .refine((r) => (r.motivo === null) === (r.referencia === null), {
    message: 'El motivo y la referencia van juntos',
    path: ['referencia'],
  })
  .refine(
    (r) => r.versiones.every((v, i) => i === 0 || v.numero_version > r.versiones[i - 1].numero_version),
    { message: 'Las versiones van en orden estrictamente creciente', path: ['versiones'] },
  );

export type RespuestaExportar = z.infer<typeof esquemaRespuestaExportar>;
type VersionRespuesta = RespuestaExportar['versiones'][number];

// ---------------------------------------------------------------- la carga v1

const esquemaVersionCopia = z.strictObject({
  numero: z.number().int().positive(),
  alcance: z.enum(ALCANCES),
  alcanceEtiqueta: z.string(),
  autor: z.string(),
  firmadaEn: z.string(),
  sello: z.string(),
  huella: hex32,
  huellaAnterior: hex32,
  motivoCambio: z.string().nullable().optional(),
  texto: z.string().optional(),
  reservadas: z.string().nullable().optional(),
  contenidoCanonico: z.string().optional(),
  participantes: z.array(z.strictObject({ nombre: z.string(), papel: z.string().nullable() })).optional(),
});

/** La carga que va cifrada en el fichero. Lo que el visor pinta, y nada más. */
export const esquemaCopiaV1 = z.strictObject({
  formato: z.literal(FORMATO),
  formato_version: z.literal(FORMATO_VERSION),
  marca: z.strictObject({
    codigo: z.uuid(),
    quien: z.string().min(1),
    rol: z.string(),
    fecha: z.string(),
    motivo: z.string(),
  }),
  titulo: z.string(),
  paciente: z.strictObject({ id: z.uuid(), nombre: z.string(), apellidos: z.string() }),
  nota: z.strictObject({ id: z.uuid(), fechaSesion: z.string(), modalidad: z.string() }),
  proyeccion: z.enum(PROYECCIONES),
  proyeccionEtiqueta: z.string(),
  motivo: z.enum(MOTIVOS).nullable(),
  motivoEtiqueta: z.string().nullable(),
  referencia: z.string().nullable(),
  generadaEn: z.string(),
  zona: z.string(),
  avisos: z.array(z.string()),
  formula: z.string().optional(),
  etiquetas: z.record(z.string(), z.string()),
  versiones: z.array(esquemaVersionCopia).min(1),
});

export type CopiaV1 = z.infer<typeof esquemaCopiaV1>;
export type VersionCopia = z.infer<typeof esquemaVersionCopia>;

// ---------------------------------------------------------------- formateo

/** El subconjunto del sobre que manda la base (§1.2). Las claves son las del sobre. */
const esquemaSelloExportado = z.object({
  esquema_version: z.number(),
  cita_id: z.string().nullable(),
  abierta_en: z.string(),
  firmada_en: z.string(),
  redactada_en_sesion: z.boolean(),
  margen_sesion_minutos: z.number().int().nullable(),
  fecha_sesion: fechaIso,
});

/** `null` («ilegible») si no es el subconjunto, no es de la era vigente o sus instantes no valen. */
function leerSelloExportado(crudo: unknown): SelloLeido | null {
  const r = esquemaSelloExportado.safeParse(crudo);
  if (!r.success || r.data.esquema_version !== ESQUEMA_VERSION) return null;
  const abiertaEn = new Date(r.data.abierta_en);
  const firmadaEn = new Date(r.data.firmada_en);
  if (Number.isNaN(abiertaEn.getTime()) || Number.isNaN(firmadaEn.getTime())) return null;
  return {
    citaId: r.data.cita_id,
    abiertaEn,
    firmadaEn,
    redactadaEnSesion: r.data.redactada_en_sesion,
    margenMinutos: r.data.margen_sesion_minutos,
    fechaSesion: r.data.fecha_sesion,
  };
}

const fechaYHora = (iso: string, zona: string) => {
  const d = new Date(iso);
  return `${formatearFechaCorta(d, zona)} ${formatearHora(d, zona)}`;
};

/** «AAAA-MM-DD» → «dd/MM/yyyy», sin pasar por un `Date` (es una fecha de calendario, sin zona). */
function fechaDeCalendario(iso: string): string {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Como `lib/notas/servidor.ts`: el texto del cuerpo, o `''` si el cuerpo no se lee. */
function textoDelCuerpo(cuerpo: string): string {
  try {
    const texto = (JSON.parse(cuerpo) as { texto?: unknown }).texto;
    return typeof texto === 'string' ? texto : '';
  } catch {
    return '';
  }
}

const unirNombre = (...partes: (string | null | undefined)[]) =>
  partes
    .map((p) => (p ?? '').trim())
    .filter((p) => p !== '')
    .join(' ');

const ETIQUETA_ROL: Record<(typeof ROLES)[number], ClaveDeCatalogo> = {
  profesional_sanitario: 'roles.profesionalSanitario',
  administrador: 'roles.administrador',
};

const ETIQUETA_ALCANCE: Record<(typeof ALCANCES)[number], ClaveDeCatalogo> = {
  individual: 'notas.firma.individual',
  conjunta: 'notas.firma.conjunta',
};

const ETIQUETA_PROYECCION: Record<ProyeccionExportacion, ClaveDeCatalogo> = {
  profesional: 'exportaciones.copia.proyecciones.profesional',
  paciente: 'exportaciones.copia.proyecciones.paciente',
};

const ETIQUETA_MOTIVO: Record<MotivoExportacion, ClaveDeCatalogo> = {
  peticion_paciente: 'exportaciones.copia.motivos.peticion_paciente',
  requerimiento_judicial_o_inspeccion: 'exportaciones.copia.motivos.requerimiento_judicial_o_inspeccion',
  traspaso_caso: 'exportaciones.copia.motivos.traspaso_caso',
};

/** Las etiquetas de los campos: van dentro de la carga cifrada, con la copia. */
function etiquetasDeLaCopia(): Record<string, string> {
  const claves = [
    'paciente',
    'fechaSesion',
    'modalidad',
    'proyeccion',
    'motivo',
    'referencia',
    'generadaEn',
    'zona',
    'version',
    'alcance',
    'autor',
    'firmadaEn',
    'sello',
    'huella',
    'huellaAnterior',
    'motivoCambio',
    'texto',
    'textoVacio',
    'reservadas',
    'sinReservadas',
    'contenidoCanonico',
    'participantes',
    'formulaTitulo',
  ] as const;
  return Object.fromEntries(claves.map((c) => [c, t(`exportaciones.copia.${c}`)]));
}

function proyectarVersion(
  v: VersionRespuesta,
  proyeccion: ProyeccionExportacion,
  zona: string,
): VersionCopia {
  const comun: VersionCopia = {
    numero: v.numero_version,
    alcance: v.alcance,
    alcanceEtiqueta: t(ETIQUETA_ALCANCE[v.alcance]),
    autor: v.autor_nombre,
    firmadaEn: fechaYHora(v.creada_en, zona),
    sello: fraseDelSello(leerSelloExportado(v.sello), zona),
    huella: v.huella,
    huellaAnterior: v.huella_anterior,
  };

  if (proyeccion === 'profesional') {
    return {
      ...comun,
      motivoCambio: v.motivo_cambio ?? null,
      texto: textoDelCuerpo(v.cuerpo ?? ''),
      reservadas: v.anotaciones_reservadas ? v.anotaciones_reservadas : null,
      contenidoCanonico: v.contenido_canonico ?? '',
    };
  }

  // Proyección del paciente: NUNCA reservadas ni canónico (que las contiene), aunque lleguen.
  if (v.alcance === 'individual') {
    return { ...comun, motivoCambio: v.motivo_cambio ?? null, texto: textoDelCuerpo(v.cuerpo ?? '') };
  }
  // Conjunta (ADR-030): fecha, asistentes y tipo de sesión; ni cuerpo ni motivo del cambio.
  return {
    ...comun,
    participantes: (v.participantes ?? []).map((p) => ({
      nombre: unirNombre(p.nombre, p.apellidos),
      papel: p.papel,
    })),
  };
}

/** La respuesta validada → la carga v1 que se cifra. Pura. */
export function proyectar(r: RespuestaExportar): CopiaV1 {
  const zona = r.zona;
  const versiones = r.versiones.map((v) => proyectarVersion(v, r.proyeccion, zona));
  const generadaEn = fechaYHora(r.generada_en, zona);

  const avisos: string[] = [];
  if (r.proyeccion === 'paciente') {
    avisos.push(t('exportaciones.copia.exclusion'));
    if (r.versiones.some((v) => v.alcance === 'conjunta')) avisos.push(t('exportaciones.copia.conjunta'));
  }
  avisos.push(t('exportaciones.copia.notaHuellaAnterior'));

  const motivoEtiqueta = r.motivo === null ? null : t(ETIQUETA_MOTIVO[r.motivo]);

  return {
    formato: FORMATO,
    formato_version: FORMATO_VERSION,
    marca: {
      codigo: r.exportacion_id,
      quien: unirNombre(r.exportada_por.nombre, r.exportada_por.apellidos),
      rol: t(ETIQUETA_ROL[r.exportada_por.rol]),
      fecha: generadaEn,
      motivo: motivoEtiqueta ?? t('exportaciones.marca.copiaProfesional'),
    },
    titulo: t('exportaciones.copia.titulo'),
    paciente: { id: r.paciente.id, nombre: r.paciente.nombre, apellidos: r.paciente.apellidos },
    nota: {
      id: r.nota.id,
      fechaSesion: fechaDeCalendario(r.nota.fecha_sesion),
      modalidad: t(`notas.modalidad.${r.nota.modalidad}`),
    },
    proyeccion: r.proyeccion,
    proyeccionEtiqueta: t(ETIQUETA_PROYECCION[r.proyeccion]),
    motivo: r.motivo,
    motivoEtiqueta,
    referencia: r.referencia,
    generadaEn,
    zona,
    avisos,
    ...(r.proyeccion === 'profesional' ? { formula: t('exportaciones.copia.formula') } : {}),
    etiquetas: etiquetasDeLaCopia(),
    versiones,
  };
}
