import type { SupabaseClient, User } from '@supabase/supabase-js';

import type { Database } from '../supabase/tipos-bd';

/**
 * Forma de lo que devuelven `obtenerUsuario()`/`exigirSesion()` de lib/supabase/sesion.ts.
 * Se declara aquí en vez de importarla para que lib/cuentas/ no dependa de
 * `next/navigation` (que exigirSesion() arrastra por su `redirect`): quien llama pasa la
 * sesión que ya tiene, y esta carpeta no decide cuándo redirigir.
 */
export type Sesion = {
  supabase: SupabaseClient<Database>;
  usuario: User;
};

/** Resultado uniforme de las operaciones de cuentas: nunca lanza, siempre se comprueba `ok`. */
export type ResultadoCuentas<Exito extends object = Record<string, never>> =
  | ({ ok: true } & Exito)
  | { ok: false; motivo: string; mensaje: string };
