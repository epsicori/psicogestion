'use server';

import { z } from 'zod';

import { fijarPinHistoria } from '@/lib/cuentas/candado';
import { esquemaPin } from '@/lib/cuentas/esquemas';
import { generarCodigosRecuperacion } from '@/lib/cuentas/totp';
import { ESTADO_INICIAL, type EstadoFormulario } from '@/lib/formularios';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

/**
 * Genera los códigos de recuperación del propio usuario. Se llama **después** de
 * verificar el TOTP y no antes: `generar_codigos_recuperacion()` exige segundo
 * factor reciente (T-006·a), así que pedirlos antes falla por diseño.
 *
 * La pantalla la llama **solo al activar** el factor (T-037). No es una barrera: el
 * titular puede regenerar su lote llamando al RPC con su propio JWT, y la base lo
 * permite con un reto TOTP reciente.
 */
export async function generarCodigos(): Promise<
  { ok: true; codigos: string[] } | { ok: false; mensaje: string }
> {
  const sesion = await exigirSesion();
  const resultado = await generarCodigosRecuperacion(sesion);

  if (!resultado.ok) {
    return { ok: false, mensaje: resultado.mensaje };
  }

  return { ok: true, codigos: resultado.codigos };
}

/**
 * Fija el PIN de historia del propio usuario. `esquemaPin` es EL MISMO objeto que
 * valida el formulario; la confirmación de que se ha tecleado dos veces igual es
 * cosa de la pantalla, porque el esquema solo conoce un campo.
 *
 * Recibe `unknown` aunque el formulario valide antes: una Server Action es un punto
 * de entrada público y lo que llega por ahí no está validado por definición.
 */
export async function fijarPin(datos: unknown): Promise<EstadoFormulario> {
  const sesion = await exigirSesion();
  const resultado = esquemaPin.safeParse(datos);

  if (!resultado.success) {
    return { ...ESTADO_INICIAL, errores: z.flattenError(resultado.error).fieldErrors };
  }

  const fijado = await fijarPinHistoria(sesion, resultado.data.pin);

  if (!fijado.ok) {
    return { ...ESTADO_INICIAL, mensaje: fijado.mensaje };
  }

  return { ...ESTADO_INICIAL, mensaje: t('primeraVez.pin.fijado') };
}
