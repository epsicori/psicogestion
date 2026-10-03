import { cookies } from 'next/headers';
import { connection } from 'next/server';

import { COOKIE_FRANJAS_DESCARTADAS } from '@/components/armazon/avisos-constantes';
import { parsearDescartadas, type DatosAvisos } from '@/lib/agenda/avisos';
import { leerAvisos } from '@/lib/citas/avisos';
import { obtenerUsuario } from '@/lib/supabase/sesion';

/**
 * Los avisos del armazón al día (T-015, R2.1). Solo lectura: ni cookies que escribir, ni acceso
 * a la historia, ni auditoría. El cliente lo pide al navegar y al volver a la pestaña, nunca con
 * un temporizador: la sesión caduca a los 30 minutos de inactividad y un sondeo la mantendría
 * viva (decisión fundacional, R0.8).
 *
 * - `connection()` primero: es de la petición, no del build. Sin `use cache` de ningún tipo
 *   (ADR-043): es de cada usuario.
 * - `obtenerUsuario()` y no `exigirSesion()`: un `redirect` dentro de un `fetch` no sirve de
 *   nada. Sin usuario, 401.
 * - Si cualquiera de las tres lecturas falla, 503: el cliente conserva lo que tenía y una
 *   caída momentánea de la base no apaga una franja en curso.
 * - `Cache-Control: private, no-store` siempre, y nunca `Access-Control-Allow-*`.
 */

const CABECERAS = { 'Cache-Control': 'private, no-store' };

function responder(estado: number, cuerpo: object): Response {
  return Response.json(cuerpo, { status: estado, headers: CABECERAS });
}

export async function GET(): Promise<Response> {
  await connection();

  const { supabase, usuario } = await obtenerUsuario();
  if (!usuario) return responder(401, {});

  try {
    const ahora = new Date();
    const [avisos, almacen] = await Promise.all([leerAvisos({ supabase, usuario }, ahora), cookies()]);
    const { sesiones, recuento, notificaciones } = avisos;
    if (sesiones === null || recuento === null || notificaciones === null) {
      return responder(503, {});
    }

    const datos: DatosAvisos = {
      ahoraServidor: avisos.ahoraServidor,
      sesiones,
      recuento,
      notificaciones,
      descartadas: parsearDescartadas(almacen.get(COOKIE_FRANJAS_DESCARTADAS)?.value),
    };
    return responder(200, datos);
  } catch (error) {
    console.error('GET /api/avisos: fallo al leer los avisos', error);
    return responder(503, {});
  }
}
