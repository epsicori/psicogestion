// T-026a. El drenado de la cola de facturación, llamado por pg_cron (vía pg_net) cada 5 minutos con un
// secreto compartido. Sin sesión: el proxy deja pasar esta ruta y aquí se comprueba el secreto.
//
// Solo registra `console.error('[facturacion] drenar', codigo)`: nunca el error, el cuerpo ni la clave.

import { timingSafeEqual } from 'node:crypto';

import { connection } from 'next/server';

import { drenarEnvios } from '@/lib/facturacion/cola';
import { leerClaveProveedor } from '@/lib/facturacion/clave';
import { descifrarNifDestinatario } from '@/lib/facturacion/nif';
import { proveedorActivoServicio } from '@/lib/facturacion/registro';
import { sincronizar } from '@/lib/facturacion/sincronizador';
import { crearClienteAdministracion } from '@/lib/supabase/administracion';

export const maxDuration = 60;

const CABECERAS = { 'Cache-Control': 'private, no-store' };

function responder(cuerpo: Record<string, unknown>, status: number): Response {
  return Response.json(cuerpo, { status, headers: CABECERAS });
}

function secretoCorrecto(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // timingSafeEqual lanza si las longitudes difieren: se comprueba antes.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  await connection();

  const esperado = process.env.FACTURACION_DRENAR_SECRETO;
  if (!esperado) return responder({ estado: 'sin_configurar' }, 503);

  const cabecera = request.headers.get('authorization') ?? '';
  const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice('Bearer '.length) : '';
  if (!secretoCorrecto(recibido, esperado)) return responder({ estado: 'no_autorizado' }, 401);

  try {
    const activo = await proveedorActivoServicio();
    if (!activo) return responder({ estado: 'sin_proveedor' }, 200);

    const clave = await leerClaveProveedor();
    if (!clave) return responder({ estado: 'sin_clave' }, 200);

    const proveedor = activo.crear(clave);
    const bd = crearClienteAdministracion();
    const envios = await drenarEnvios({
      bd,
      proveedor,
      idProveedor: activo.ficha.id,
      descifrarNif: descifrarNifDestinatario,
    });
    const sincronizacion = await sincronizar({
      bd,
      proveedor,
      idProveedor: activo.ficha.id,
      ahora: new Date(),
    });
    return responder({ estado: 'ok', envios, sincronizacion }, 200);
  } catch {
    console.error('[facturacion] drenar', 'fallo');
    return responder({ estado: 'fallo' }, 500);
  }
}
