import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { claveAnonSupabase, urlSupabase } from './config';
import type { Database } from './tipos-bd';

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * `cookies()` es async en Next 16. `setAll` solo funciona dentro de una Server
 * Function o un Route Handler; desde un Server Component es de solo lectura y
 * lanzará si se intenta escribir — de ahí el try/catch: en ese caso el Proxy es
 * quien se encarga de refrescar y persistir la sesión.
 */
export async function crearClienteServidor() {
  const almacenCookies = await cookies();

  return createServerClient<Database>(urlSupabase, claveAnonSupabase, {
    cookies: {
      getAll() {
        return almacenCookies.getAll();
      },
      setAll(cookiesAEscribir) {
        try {
          cookiesAEscribir.forEach(({ name, value, options }) => {
            almacenCookies.set(name, value, options);
          });
        } catch {
          // Llamado desde un Server Component: no se pueden escribir cookies aquí.
          // El Proxy refresca la sesión en la siguiente petición.
        }
      },
    },
  });
}
