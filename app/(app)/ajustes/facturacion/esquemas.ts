import { z } from 'zod';

import { t } from '@/lib/i18n';

/**
 * El mismo esquema valida en el formulario y en la Server Action. Es el formato que la base
 * vuelve a comprobar antes de tocar el Vault (`guardar_clave_proveedor_facturacion`): la clave
 * no lleva espacios ni símbolos raros, y ni su longitud ni su forma van nunca a un mensaje.
 *
 * `proveedor` es el enum de la base; un valor nuevo exige una ficha en `lib/facturacion/registro.ts`.
 */
export const esquemaClaveProveedor = z.object({
  proveedor: z.enum(['holded']),
  clave: z
    .string()
    .trim()
    .min(16, t('ajustes.facturacion.errores.clave_invalida'))
    .max(256, t('ajustes.facturacion.errores.clave_invalida'))
    .regex(/^[A-Za-z0-9._-]+$/, t('ajustes.facturacion.errores.clave_invalida')),
});

export type DatosClaveProveedor = z.infer<typeof esquemaClaveProveedor>;
