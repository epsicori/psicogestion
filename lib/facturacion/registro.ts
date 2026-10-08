import 'server-only';

import { crearClienteAdministracion } from '@/lib/supabase/administracion';
import { crearClienteServidor } from '@/lib/supabase/servidor';

import { crearProveedorHolded, fichaHolded } from './holded';
import type { FichaProveedor, IdProveedor, ProveedorFacturacion } from './proveedor';

/** Los programas que la app sabe usar. Un valor nuevo del enum exige una entrada aquí. */
export const FICHAS: Record<IdProveedor, FichaProveedor> = {
  holded: fichaHolded,
};

export interface ProveedorActivo {
  ficha: FichaProveedor;
  crear: (clave: string) => ProveedorFacturacion;
}

function resolver(id: IdProveedor | null): ProveedorActivo | null {
  if (id === null) return null;
  const ficha = FICHAS[id];
  // El ÚNICO interruptor del modo degradado: un programa sin implementar es como no tener ninguno.
  if (!ficha || !ficha.disponible) return null;
  return { ficha, crear: (clave) => crearProveedorHolded({ clave }) };
}

/** El programa conectado, leído con la sesión del usuario; `null` si no hay o no está disponible. */
export async function proveedorActivo(): Promise<ProveedorActivo | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('proveedor_facturacion_activo');
  if (error) throw new Error('No se pudo leer el programa de facturación.');
  return resolver(data);
}

/** Lo mismo con el cliente de administración, para la ruta del drenado (sin sesión). */
export async function proveedorActivoServicio(): Promise<ProveedorActivo | null> {
  const { data, error } = await crearClienteAdministracion().rpc('proveedor_facturacion_activo');
  if (error) throw new Error('No se pudo leer el programa de facturación.');
  return resolver(data);
}
