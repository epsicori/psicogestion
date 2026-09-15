import { createBrowserClient } from '@supabase/ssr';

import { claveAnonSupabase, urlSupabase } from './config';
import type { Database } from './tipos-bd';

/**
 * Cliente de Supabase para el navegador. Lo usa una sola pantalla —el alta del
 * segundo factor en `app/primera-vez/segundo-factor.tsx`—, porque `auth.mfa.*`
 * exige cliente de navegador; todo lo demás se renderiza y se muta en servidor.
 *
 * **`autoRefreshToken: false` es lo que hace real la sesión de 30 minutos** y no
 * una preferencia de estilo. Por defecto `createBrowserClient` lo pone a `true`
 * (`autoRefreshToken: options?.auth?.autoRefreshToken ?? isBrowser()`, ver
 * `node_modules/@supabase/ssr/dist/main/createBrowserClient.js`), y auth-js
 * arranca entonces un tic cada 30 s (`AUTO_REFRESH_TICK_DURATION_MS`) que renueva
 * el token por su cuenta. Con ese tic vivo, una pestaña abierta y quieta refresca
 * sola indefinidamente: para GoTrue eso es actividad, así que
 * `inactivity_timeout` no vencería nunca y el ajuste sería decorativo.
 *
 * Aquí el token lo refresca el Proxy en cada petición, que es justamente lo que
 * ocurre cuando alguien está usando la aplicación de verdad.
 */
export function crearClienteNavegador() {
  return createBrowserClient<Database>(urlSupabase, claveAnonSupabase, {
    auth: { autoRefreshToken: false },
  });
}
