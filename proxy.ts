import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { claveAnonSupabase, urlSupabase } from '@/lib/supabase/config';

// '/prototipo' es la maqueta visual congelada: datos inventados, cero acceso a la
// base de datos. Pública para poder mirarla sin sesión. Antes de producción, o se
// protege o se borra (ver app/prototipo/README.md).
const RUTAS_PUBLICAS = ['/login', '/prototipo'];

export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(urlSupabase, claveAnonSupabase, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesAEscribir, cabeceras) {
        cookiesAEscribir.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        // Recrear la respuesta con la petición actualizada antes de escribir las
        // cookies en ella: si se reutilizara la respuesta anterior, las cookies
        // renovadas no viajarían.
        respuesta = NextResponse.next({ request: { headers: request.headers } });
        cookiesAEscribir.forEach(({ name, value, options }) => {
          respuesta.cookies.set(name, value, options);
        });
        Object.entries(cabeceras).forEach(([clave, valor]) => {
          respuesta.headers.set(clave, valor);
        });
      },
    },
  });

  // Esta llamada es la que refresca el token si ha caducado.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esRutaPublica = RUTAS_PUBLICAS.some(
    (ruta) => request.nextUrl.pathname === ruta || request.nextUrl.pathname.startsWith(`${ruta}/`),
  );

  // Guardia optimista: cada Server Action revalida la sesión por su cuenta con
  // exigirSesion(), esto solo evita el viaje a páginas protegidas sin sesión.
  if (!user && !esRutaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redireccion = NextResponse.redirect(url);
    // Arrastrar las cookies acumuladas en `respuesta` (p. ej. borrados de cookies
    // inválidas escritos por setAll arriba): si no se copian, se pierden al
    // redirigir con una respuesta nueva.
    respuesta.cookies.getAll().forEach((cookie) => {
      redireccion.cookies.set(cookie);
    });
    // Arrastrar también las cabeceras (p. ej. las anti-caché que setAll aplica en
    // `respuesta.headers`): si no se copian, se pierden al redirigir con una
    // respuesta nueva, igual que las cookies de arriba.
    respuesta.headers.forEach((valor, clave) => {
      redireccion.headers.set(clave, valor);
    });
    return redireccion;
  }

  // Entre getUser() y este return no puede haber ningún NextResponse.next() nuevo,
  // o se pierden las cookies renovadas escritas arriba.
  return respuesta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
