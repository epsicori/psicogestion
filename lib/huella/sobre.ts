// T-005 · El sobre canónico (ADR-035 + ADR-046), congelado hoy en
// `esquema_version = 4` (T-012c: ADR-067, ADR-071 y ADR-072). Diecisiete
// claves exactas, ni una más ni una menos.
// `algoritmo_version` NO entra en el sobre: es metadato de la era, no
// contenido. `esquema_version` SÍ, como manda el ADR-035.
//
// Decisiones cerradas aquí (ver el «Diseño aprobado · §4» del ticket):
//   1. `esquema_version = 4`: las versiones 1-3 (sin la cabecera de la nota)
//      no existen en ninguna fila de ninguna base — `notas_clinicas_versiones`
//      estaba vacía cuando se escribieron T-012a y T-012c.
//   2. Los instantes van como `Date.prototype.toISOString()`: UTC, ms, `Z`.
//      Nunca la representación de sesión de Postgres.
//   3. `firmada_en === creada_en`, siempre: son el mismo instante con dos
//      nombres que dos ADR distintos obligan a llevar.
//   4. El margen aplicado se guarda DENTRO del sobre, no por referencia al
//      centro (el ADR-046 bloquea explícitamente lo segundo).
//   5. `cuerpo` es siempre un objeto, nunca un array ni un escalar.
//   6. `alcance` entra en el sobre (ADR-057): decide quién puede leer esa
//      versión, así que forma parte de lo firmado, no solo de la columna.
//   7. La cabecera de la nota entra en el sobre (T-012c): `nota_id`
//      (ADR-067), `paciente_id` y `episodio_id` (deciden la lectura),
//      `fecha_sesion` (ADR-071, `AAAA-MM-DD`, una fecha sin zona) y
//      `coprofesional_id` (ADR-072, la clave siempre está; `null` si no hay
//      coterapia). Se leen de la cabecera `notas_clinicas` que se firma,
//      nunca del formulario.

import { z } from 'zod';

import { canonizar, type ValorJson } from './jcs';
import { normalizarNfc } from './nfc';
import { calcularRedactadaEnSesion } from './sesion';

export const ESQUEMA_VERSION = 4;
export const ALGORITMO_VERSION = 1;

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// UTC, milisegundos, sufijo Z: exactamente lo que produce `toISOString()`.
const PATRON_INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const instanteIso = z
  .string()
  .refine((v) => PATRON_INSTANTE_ISO.test(v), 'Instante ISO-8601 UTC con milisegundos y sufijo Z (toISOString())');

const uuidMinusculas = z.string().refine((v) => PATRON_UUID.test(v), 'UUID en minúsculas');

// Una fecha de calendario, no un instante: sin hora ni zona. El `refine`
// rechaza las fechas imposibles (2026-02-30) que la expresión regular deja pasar.
const fechaIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'fecha_sesion debe ser una fecha real AAAA-MM-DD');

const cuerpoObjeto = z.custom<Record<string, ValorJson>>(
  (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  'cuerpo debe ser un objeto, nunca un array ni un escalar',
);

/** Zod 4, estricto: diecisiete claves exactas, ninguna más. */
export const esquemaSobre = z
  .object({
    abierta_en: instanteIso,
    alcance: z.enum(['individual', 'conjunta']),
    anotaciones_reservadas: z.string().nullable(),
    autor_id: uuidMinusculas,
    cita_id: uuidMinusculas.nullable(),
    // Nulable pero no opcional: omitir la clave falla (ADR-072.3).
    coprofesional_id: uuidMinusculas.nullable(),
    creada_en: instanteIso,
    cuerpo: cuerpoObjeto,
    episodio_id: uuidMinusculas,
    esquema_version: z.literal(ESQUEMA_VERSION),
    fecha_sesion: fechaIso,
    firmada_en: instanteIso,
    margen_sesion_minutos: z.number().int().nullable(),
    motivo_cambio: z.string().nullable(),
    nota_id: uuidMinusculas,
    paciente_id: uuidMinusculas,
    redactada_en_sesion: z.boolean(),
  })
  .strict();

export type Sobre = z.infer<typeof esquemaSobre>;

export interface EntradaFirma {
  notaId: string;
  /** Leídos de la cabecera `notas_clinicas` que se firma (T-012c). */
  pacienteId: string;
  episodioId: string;
  /** `'AAAA-MM-DD'`, tal como PostgREST devuelve una columna `date`. Nunca un `Date`. */
  fechaSesion: string;
  /** Obligatorio: sin coterapia, el llamante escribe `null`. */
  coprofesionalId: string | null;
  autorId: string;
  cuerpo: Record<string, ValorJson>;
  anotacionesReservadas: string | null;
  motivoCambio: string | null;
  alcance: 'individual' | 'conjunta';
  citaId: string | null;
  ventanaCita: { inicio: Date; fin: Date } | null;
  margenMinutos: number | null;
  abiertaEn: Date;
  /** Inyectable: sin esto las pruebas del sobre no son deterministas. */
  ahora?: Date;
}

/** Construye el sobre: NFC, cálculo del bloque de sesión y validación Zod. */
export function construirSobre(entrada: EntradaFirma): Sobre {
  const firmadaEn = entrada.ahora ?? new Date();

  // §6.6.9 del diseño aprobado: sin cita, ni margen ni «en sesión». Se impone
  // aquí y el disparador lo vuelve a exigir en la base.
  const citaId = entrada.citaId;
  const margenMinutos = citaId === null ? null : entrada.margenMinutos;
  const ventanaCita = citaId === null ? null : entrada.ventanaCita;

  const redactadaEnSesion = calcularRedactadaEnSesion({
    abiertaEn: entrada.abiertaEn,
    firmadaEn,
    ventanaCita,
    margenMinutos,
  });

  const creadaEnIso = firmadaEn.toISOString();

  const sinNormalizar = {
    abierta_en: entrada.abiertaEn.toISOString(),
    alcance: entrada.alcance,
    anotaciones_reservadas: entrada.anotacionesReservadas,
    autor_id: entrada.autorId.toLowerCase(),
    cita_id: citaId,
    coprofesional_id: entrada.coprofesionalId === null ? null : entrada.coprofesionalId.toLowerCase(),
    creada_en: creadaEnIso,
    cuerpo: entrada.cuerpo,
    episodio_id: entrada.episodioId.toLowerCase(),
    esquema_version: ESQUEMA_VERSION,
    fecha_sesion: entrada.fechaSesion,
    // Mismo instante que `creada_en`, con el nombre que exige el ADR-046.
    firmada_en: creadaEnIso,
    margen_sesion_minutos: margenMinutos,
    motivo_cambio: entrada.motivoCambio,
    nota_id: entrada.notaId.toLowerCase(),
    paciente_id: entrada.pacienteId.toLowerCase(),
    redactada_en_sesion: redactadaEnSesion,
  } satisfies Record<string, unknown>;

  // El orden es: normalizarNfc → validación Zod → canonizar. Nunca al revés.
  const normalizado = normalizarNfc(sinNormalizar as unknown as ValorJson);
  return esquemaSobre.parse(normalizado);
}

export function canonizarSobre(sobre: Sobre): string {
  return canonizar(sobre as unknown as ValorJson);
}
