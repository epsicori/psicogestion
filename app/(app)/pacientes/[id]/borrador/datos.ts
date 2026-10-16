import 'server-only';

import { claveDeCifrado } from '@/lib/cifrado/claves';
import type { DepsBorrador } from '@/lib/economico/borrador';
import { proveedorActivo } from '@/lib/facturacion/registro';
import { exigirSesion } from '@/lib/supabase/sesion';

/**
 * Las dependencias del núcleo del borrador desde la sesión de quien mira (T-046): su cliente con
 * RLS, su id, el reloj del servidor, la clave de cifrado y el programa conectado, que solo sirve
 * para nombrarlo en «Ya se preparó en …». Ni la página ni las acciones fabrican otras.
 */
export async function depsDeSesion(): Promise<DepsBorrador> {
  const { supabase, usuario } = await exigirSesion();
  const activo = await proveedorActivo().catch(() => null);
  const programa = activo?.ficha.nombre ?? null;
  return {
    supabase,
    usuario: { id: usuario.id },
    ahora: () => new Date(),
    claveDeCifrado,
    proveedor: () => programa,
  };
}
