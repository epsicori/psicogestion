// T-040 · Los valores del formato `psicogestion.copia-nota` versión 1 (ADR-076).
//
// Cambiar cualquiera de estos valores es un formato nuevo: se sube `FORMATO_VERSION`, nunca se
// bajan los parámetros de Argon2id en silencio. Lo que tiene gemelo en SQL (`formato_version`,
// `algoritmo`, `parametros_kdf`) lo coteja el banco de RLS de la exportación.

export const FORMATO = 'psicogestion.copia-nota' as const;
export const FORMATO_VERSION = 1 as const;
export const ALGORITMO = 'argon2id-aes-256-gcm' as const;

/** Argon2id (RFC 9106, v0x13): 64 MiB, tres pasadas, una vía, clave de 32 bytes. */
export const KDF = { m: 65536, t: 3, p: 1, longitud: 32 } as const;

export const SAL_BYTES = 16;
export const NONCE_BYTES = 12;

export const CONTRASENA_MIN = 12;
export const CONTRASENA_MAX = 256;

export const REFERENCIA_MIN = 3;
export const REFERENCIA_MAX = 200;

/** Los tres valores del enum `motivo_exportacion`, en este orden. */
export const MOTIVOS = [
  'peticion_paciente',
  'requerimiento_judicial_o_inspeccion',
  'traspaso_caso',
] as const;

export type MotivoExportacion = (typeof MOTIVOS)[number];

export const PROYECCIONES = ['profesional', 'paciente'] as const;
export type ProyeccionExportacion = (typeof PROYECCIONES)[number];

/** Los parámetros con los que se deriva la clave. El núcleo solo admite `p = 1`. */
export interface ParametrosKdf {
  m: number;
  t: number;
  p: number;
  longitud: number;
}
