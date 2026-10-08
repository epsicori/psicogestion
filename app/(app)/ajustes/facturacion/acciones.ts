'use server';

import { revalidatePath } from 'next/cache';

import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { ErrorProveedor, type CodigoErrorProveedor } from '@/lib/facturacion/proveedor';
import { proveedorActivo } from '@/lib/facturacion/registro';
import { crearClienteAdministracion } from '@/lib/supabase/administracion';
import { exigirSesion } from '@/lib/supabase/sesion';

import { esquemaClaveProveedor } from './esquemas';

/**
 * Las acciones de Ajustes › Programa de facturación (T-026a). Solo el administrador.
 *
 * La comprobación de rol de aquí es cortesía: la que manda está en las funciones de la base,
 * que lanzan 42501 a quien no es administrador. **Ningún valor devuelto lleva la clave**: ni
 * al guardarla ni al fallar. Devuelven códigos, y la pantalla pone el texto.
 */
export type ErrorDeAjuste = 'clave_invalida' | 'sin_permiso' | 'fallo';
export type ResultadoDeAjuste = { ok: true } | { ok: false; error: ErrorDeAjuste };
export type ErrorDeConexion = CodigoErrorProveedor | 'sin_permiso' | 'sin_programa' | 'fallo';
export type ResultadoDeConexion = { ok: true } | { ok: false; error: ErrorDeConexion };

async function exigirAdministrador() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);
  if (!estado || estado.rol !== 'administrador') return null;
  return sesion;
}

export async function guardarClaveProveedor(datos: unknown): Promise<ResultadoDeAjuste> {
  const sesion = await exigirAdministrador();
  if (!sesion) return { ok: false, error: 'sin_permiso' };

  const resultado = esquemaClaveProveedor.safeParse(datos);
  if (!resultado.success) return { ok: false, error: 'clave_invalida' };

  const { error } = await sesion.supabase.rpc('guardar_clave_proveedor_facturacion', {
    p_proveedor: resultado.data.proveedor,
    p_clave: resultado.data.clave,
  });
  if (error) {
    // Solo el código SQL decide el texto; el mensaje de la base no sale de aquí.
    if (error.code === '42501') return { ok: false, error: 'sin_permiso' };
    if (error.code === '22023') return { ok: false, error: 'clave_invalida' };
    return { ok: false, error: 'fallo' };
  }

  revalidatePath('/ajustes/facturacion');
  return { ok: true };
}

/**
 * Prueba la clave guardada pidiendo al programa los documentos de ahora. La clave se lee con
 * el cliente de administración (la función de lectura es solo del consumidor) y no sale de
 * esta función.
 */
export async function probarConexion(): Promise<ResultadoDeConexion> {
  const sesion = await exigirAdministrador();
  if (!sesion) return { ok: false, error: 'sin_permiso' };

  try {
    const activo = await proveedorActivo();
    if (!activo) return { ok: false, error: 'sin_programa' };

    const { data: clave, error } = await crearClienteAdministracion().rpc('clave_proveedor_facturacion');
    if (error || !clave) return { ok: false, error: 'sin_programa' };

    await activo.crear(clave).listarDocumentosDesde(new Date());
    return { ok: true };
  } catch (e) {
    if (e instanceof ErrorProveedor) return { ok: false, error: e.codigo };
    console.error('[facturacion] probar', 'fallo');
    return { ok: false, error: 'fallo' };
  }
}

export async function desconectarProveedor(): Promise<ResultadoDeAjuste> {
  const sesion = await exigirAdministrador();
  if (!sesion) return { ok: false, error: 'sin_permiso' };

  const { error } = await sesion.supabase.rpc('quitar_proveedor_facturacion');
  if (error) return { ok: false, error: error.code === '42501' ? 'sin_permiso' : 'fallo' };

  revalidatePath('/ajustes/facturacion');
  return { ok: true };
}
