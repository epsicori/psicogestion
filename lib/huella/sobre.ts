// T-005 · El sobre canónico (ADR-035 + ADR-046), congelado hoy en
// `esquema_version = 2`. Once claves exactas, ni una más ni una menos.
// `algoritmo_version` NO entra en el sobre: es metadato de la era, no
// contenido. `esquema_version` SÍ, como manda el ADR-035.
//
// Decisiones cerradas aquí (ver el «Diseño aprobado · §4» del ticket):
//   1. `esquema_version = 2`, no 1: la versión 1 (sin el bloque de sesión del
//      ADR-046) no existe en ninguna fila de ninguna base.
//   2. Los instantes van como `Date.prototype.toISOString()`: UTC, ms, `Z`.
//      Nunca la representación de sesión de Postgres.
//   3. `firmada_en === creada_en`, siempre: son el mismo instante con dos
//      nombres que dos ADR distintos obligan a llevar.
//   4. El margen aplicado se guarda DENTRO del sobre, no por referencia al
//      centro (el ADR-046 bloquea explícitamente lo segundo).
//   5. `cuerpo` es siempre un objeto, nunca un array ni un escalar.

import { z } from 'zod';

import { canonizar, type ValorJson } from './jcs';
import { normalizarNfc } from './nfc';
import { calcularRedactadaEnSesion } from './sesion';

export const ESQUEMA_VERSION = 2;
export const ALGORITMO_VERSION = 1;

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// UTC, milisegundos, sufijo Z: exactamente lo que produce `toISOString()`.
const PATRON_INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const instanteIso = z
  .string()
  .refine((v) => PATRON_INSTANTE_ISO.test(v), 'Instante ISO-8601 UTC con milisegundos y sufijo Z (toISOString())');

const uuidMinusculas = z.string().refine((v) => PATRON_UUID.test(v), 'UUID en minúsculas');

const cuerpoObjeto = z.custom<Record<string, ValorJson>>(
  (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  'cuerpo debe ser un objeto, nunca un array ni un escalar',
);

/** Zod 4, estricto: once claves exactas, ninguna más. */
export const esquemaSobre = z
  .object({
    abierta_en: instanteIso,
    anotaciones_reservadas: z.string().nullable(),
    autor_id: uuidMinusculas,
    cita_id: uuidMinusculas.nullable(),
    creada_en: instanteIso,
    cuerpo: cuerpoObjeto,
    esquema_version: z.literal(ESQUEMA_VERSION),
    firmada_en: instanteIso,
    margen_sesion_minutos: z.number().int().nullable(),
    motivo_cambio: z.string().nullable(),
    redactada_en_sesion: z.boolean(),
  })
  .strict();

export type Sobre = z.infer<typeof esquemaSobre>;

export interface EntradaFirma {
  notaId: string;
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
    anotaciones_reservadas: entrada.anotacionesReservadas,
    autor_id: entrada.autorId.toLowerCase(),
    cita_id: citaId,
    creada_en: creadaEnIso,
    cuerpo: entrada.cuerpo,
    esquema_version: ESQUEMA_VERSION,
    // Mismo instante que `creada_en`, con el nombre que exige el ADR-046.
    firmada_en: creadaEnIso,
    margen_sesion_minutos: margenMinutos,
    motivo_cambio: entrada.motivoCambio,
    redactada_en_sesion: redactadaEnSesion,
  } satisfies Record<string, unknown>;

  // El orden es: normalizarNfc → validación Zod → canonizar. Nunca al revés.
  const normalizado = normalizarNfc(sinNormalizar as unknown as ValorJson);
  return esquemaSobre.parse(normalizado);
}

export function canonizarSobre(sobre: Sobre): string {
  return canonizar(sobre as unknown as ValorJson);
}
