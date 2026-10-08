import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { primerAccesoPendiente } from '@/lib/cuentas/primer-acceso';
import { claveAnonSupabase, urlSupabase } from '@/lib/supabase/config';

// '/prototipo' es la maqueta visual congelada: datos inventados, cero acceso a la
// base de datos. Pública para poder mirarla sin sesión. Antes de producción, o se
// protege o se borra (ver app/prototipo/README.md).
const RUTAS_PUBLICAS = ['/login', '/prototipo', '/api/facturacion/drenar'];

/**
 * Rutas que exigen sesión pero **no** exigen el primer acceso completo: son
 * justamente donde se completa (T-006·b2) o donde se recupera cuando no se puede
 * completar (T-006·b3).
 *
 * `/primera-vez` está aquí porque si no, la guardia de abajo redirigiría a
 * `/primera-vez` desde `/primera-vez` — un bucle.
 *
 * **`/recuperar` está aquí por un motivo menos evidente y más importante**: quien ha
 * perdido su segundo factor entra con contraseña, se queda en `aal1` y la guardia lo
 * manda a `/primera-vez`, donde no puede hacer nada —su factor sigue existiendo y no
 * tiene cómo superarlo—. Sin esta exención, la pantalla de recuperación existiría y
 * **nadie podría llegar a ella**.
 */
const RUTAS_DE_ACCESO = ['/primera-vez', '/recuperar'];

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

  // ---------------------------------------------------------------------------
  // Guardia del primer acceso (T-006·b2): quien no ha completado los pasos no
  // alcanza ninguna ruta con sesión.
  //
  // Vive AQUÍ y no en `app/(app)/layout.tsx` por dos motivos, y el primero es el
  // que hundió la primera propuesta de esta pantalla: un layout **no recibe el
  // pathname**, así que no puede eximirse a sí mismo, y `/primera-vez` colgando
  // del mismo grupo se redirige a sí misma en bucle. El segundo es que aquí ya
  // hay un cliente con las cookies de la petición, y la guardia optimista que ya
  // existía es exactamente esto.
  //
  // Mira LAS DOS COSAS, y ninguna sobra: el nivel de la sesión sabe si ESTA
  // sesión pasó el segundo factor —eso vive en el token, no en la tabla— y
  // `estado_de_cuenta()` sabe si al perfil le falta el PIN —eso vive en la tabla
  // y no en el token—. Con una sola, la guardia deja pasar a quien le falta un
  // paso.
  // ---------------------------------------------------------------------------
  const esRutaDeAcceso = RUTAS_DE_ACCESO.some(
    (ruta) => request.nextUrl.pathname === ruta || request.nextUrl.pathname.startsWith(`${ruta}/`),
  );

  if (user && !esRutaPublica && !esRutaDeAcceso) {
    const pasoPendiente = await primerAccesoPendiente(supabase);

    if (pasoPendiente) {
      const url = request.nextUrl.clone();
      url.pathname = '/primera-vez';
      const redireccion = NextResponse.redirect(url);
      respuesta.cookies.getAll().forEach((cookie) => redireccion.cookies.set(cookie));
      respuesta.headers.forEach((valor, clave) => redireccion.headers.set(clave, valor));
      return redireccion;
    }
  }

  // Entre getUser() y este return no puede haber ningún NextResponse.next() nuevo,
  // o se pierden las cookies renovadas escritas arriba.
  return respuesta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
