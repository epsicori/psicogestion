import type { SupabaseClient, User } from '@supabase/supabase-js';

import type { Database } from '../supabase/tipos-bd';

/**
 * Misma forma que `lib/cuentas/tipos.ts::Sesion`, declarada de nuevo aquí en
 * vez de importada: `lib/citas/` es un carpeta de dominio distinta (agenda,
 * no cuentas) y no debe acoplarse a `lib/cuentas/` para algo tan pequeño como
 * un tipo estructural. Quien llama pasa la sesión que ya tiene
 * (`exigirSesion()` de `lib/supabase/sesion.ts`, que vive en `app/`).
 */
export type Sesion = {
  supabase: SupabaseClient<Database>;
  usuario: User;
};

/**
 * Resultado uniforme de las operaciones de `lib/citas/`: nunca lanza, siempre
 * se comprueba `ok`. El valor por defecto de `Exito` es `object` (vacío) y no
 * `Record<string, never>`: ese segundo tipo exige que TODA clave del objeto
 * sea `never`, lo que choca con la propia clave `ok: true` de la unión.
 */
export type ResultadoCitas<Exito extends object = object> =
  | ({ ok: true } & Exito)
  | { ok: false; motivo: MotivoErrorCitas; mensaje: string; detalle?: DetalleRechazo };

/**
 * Mapa de errores único (§8 del diseño de T-011): todo módulo de `lib/citas/`
 * traduce el mismo puñado de SQLSTATE a los mismos motivos, para que
 * `app/` (T-011b) no tenga que aprenderse el código de la base.
 *
 * - `23P01` (exclusion_violation) → `hueco_ocupado`: la restricción de
 *   exclusión de `citas` chocó.
 * - `42501` (insufficient_privilege) → `no_autorizado` en general, o
 *   `cita_pasada` cuando el mensaje viene de `fn_proteger_cita_pasada()`
 *   (única forma de distinguirlos: la base no separa el código).
 * - `22023` (invalid_parameter_value) → `parametro_invalido`: fecha pasada,
 *   zona no IANA, alcance no resuelto, tope de 200 ocurrencias, propuesta ya
 *   resuelta, propuesta sin horario…
 * - Cualquier otro código → `desconocido`.
 */
export type MotivoErrorCitas =
  | 'hueco_ocupado'
  | 'no_autorizado'
  | 'cita_pasada'
  | 'parametro_invalido'
  | 'destino_pasado'
  | 'previsualizacion_caducada'
  | 'desconocido';

/**
 * Por qué la base rechazó con `22023` una edición de serie, su
 * previsualización o la confirmación de una propuesta (T-011b §3, ADR-068).
 * `motivo` sigue siendo `parametro_invalido`; esto afina el texto para que la
 * pantalla diga qué pasó y si «Confirmar» tiene sentido todavía. Lo produce
 * `detalleDeRechazo()` de `errores.ts`; `destino_pasado` y
 * `previsualizacion_caducada` no salen de la base, los emite `reprogramar.ts`.
 */
export type DetalleRechazo =
  | 'yaEmpezada'
  | 'canceladaOCerrada'
  | 'movidaAMano'
  | 'fechaYDiaNoCoinciden'
  | 'horarioNuevoPasado'
  | 'propuestaPasada'
  | 'sinEvento'
  | 'otraRegla'
  | 'otraZona'
  | 'citaCambiada'
  | 'sinHorario';
