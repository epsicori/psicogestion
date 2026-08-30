import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { urlSupabase } from './config';
import type { Database } from './tipos-bd';

function exigir(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Cópiala a .env.local con ` +
        `\`npx supabase status\`: NUNCA un valor real en el repositorio.`,
    );
  }
  return valor;
}

// Sin prefijo NEXT_PUBLIC_: esta clave nunca debe llegar al navegador. `server-only`
// hace que importar este módulo desde un Client Component falle en build, no solo en
// ejecución.
const claveServicioSupabase = exigir(
  'SUPABASE_SERVICE_ROLE_KEY',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * Cliente de Supabase con la clave de servicio. Es el único sitio del proyecto que la
 * usa: solo para lo que la clave anónima + RLS no puede hacer, la Admin API de Auth
 * (`auth.admin.*`) — invitar por correo, listar/borrar factores MFA, banear un usuario
 * al darlo de baja.
 *
 * `autoRefreshToken: false` y `persistSession: false` porque este cliente no representa
 * la sesión de nadie: cada llamada de administración se hace en nombre de la sesión del
 * administrador que la pide, que se autoriza en la base con las funciones `security
 * definer` de `supabase/migrations/` — nunca con esta clave. Esta clave nunca decide
 * quién puede hacer qué: eso ya lo decidió la función definer antes de que
 * `lib/cuentas/` llegue a llamar a la Admin API.
 */
export function crearClienteAdministracion(): SupabaseClient<Database> {
  return createClient<Database>(urlSupabase, claveServicioSupabase, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
