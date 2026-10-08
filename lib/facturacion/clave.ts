import 'server-only';

import { crearClienteAdministracion } from '@/lib/supabase/administracion';

/**
 * La clave del programa de facturación, leída del Vault en cada llamada. Sin `use cache`, sin
 * memorizar en el módulo y sin registrar el resultado: la clave no se queda en ningún sitio.
 */
export async function leerClaveProveedor(): Promise<string | null> {
  const { data, error } = await crearClienteAdministracion().rpc('clave_proveedor_facturacion');
  if (error) throw new Error('No se pudo leer la clave del programa de facturación.');
  return data ?? null;
}
