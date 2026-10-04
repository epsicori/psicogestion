'use server';

import { z } from 'zod';

import { esquemaRegenerarCodigos } from '@/lib/cuentas/esquemas';
import { regenerarCodigosRecuperacion } from '@/lib/cuentas/totp';
import { formatearHora } from '@/lib/fechas';
import { ESTADO_INICIAL, type EstadoFormulario } from '@/lib/formularios';
import { t, tCon } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

export type EstadoRegenerar = EstadoFormulario & { codigos?: string[] };

const ZONA_POR_DEFECTO = 'Europe/Madrid';

/**
 * Regenerar los códigos de recuperación del PROPIO usuario (T-038).
 *
 * El orden es el contrato: sesión, validación, segundo factor, comprobación del registro
 * de Postgres y los dos pasos de la base (la contraseña solo en el primero). Un TOTP erróneo no llega a la
 * base. La contraseña solo vive aquí lo que dura la llamada: no se devuelve, no se
 * registra, y esta acción no abre ni cierra ninguna sesión de Auth (`signInWithPassword`,
 * `reauthenticate`, `updateUser` y `signOut` están fuera de este recorrido a propósito:
 * el segundo factor se renueva sobre la MISMA sesión). Tampoco revalida: la pantalla la
 * refresca el cliente al pulsar «Ya los he guardado».
 *
 * Recibe `unknown` aunque el formulario valide antes: una Server Action es un punto de
 * entrada público y lo que llega por ahí no está validado por definición.
 */
export async function regenerarCodigos(datos: unknown): Promise<EstadoRegenerar> {
  const sesion = await exigirSesion();

  const resultado = esquemaRegenerarCodigos.safeParse(datos);
  if (!resultado.success) {
    // `flattenError` reparte los errores por campo y no lleva el valor tecleado.
    return { ...ESTADO_INICIAL, errores: z.flattenError(resultado.error).fieldErrors };
  }
  const { contrasena, codigo } = resultado.data;

  const { data: factores, error: errorFactores } = await sesion.supabase.auth.mfa.listFactors();
  if (errorFactores) {
    // Un fallo al leer no es «no tienes factor»: se dice como fallo (B-H8).
    console.error('[regenerarCodigos] listFactors', errorFactores.code);
    return { ...ESTADO_INICIAL, mensaje: t('cuenta.errores.generico') };
  }
  const factor = factores?.totp?.find((uno) => uno.status === 'verified') ?? null;
  if (!factor) {
    return { ...ESTADO_INICIAL, mensaje: t('cuenta.errores.sinFactor') };
  }

  // Renueva `last_challenged_at` y deja la sesión en aal2: es lo que la base exige.
  const { error: errorCodigo } = await sesion.supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: codigo,
  });
  if (errorCodigo) {
    return { ...ESTADO_INICIAL, errores: { codigo: [t('cuenta.errores.codigoNoValido')] } };
  }

  // Q1 (decisión del propietario): si la base registra los parámetros de las sentencias,
  // la contraseña acabaría en su registro. Se pregunta ANTES de enviarla y, ante la duda,
  // no se envía.
  const { data: registroSeguro, error: errorRegistro } = await sesion.supabase.rpc(
    'registro_postgres_seguro',
  );
  if (errorRegistro || registroSeguro !== true) {
    if (errorRegistro) console.error('[regenerarCodigos] registro_postgres_seguro', errorRegistro.code);
    return { ...ESTADO_INICIAL, mensaje: t('cuenta.errores.registroInseguro') };
  }

  const regeneracion = await regenerarCodigosRecuperacion(sesion, contrasena);

  if (regeneracion.ok) {
    return { ...ESTADO_INICIAL, codigos: regeneracion.codigos };
  }
  if (regeneracion.motivo === 'contrasena_incorrecta') {
    return { ...ESTADO_INICIAL, errores: { contrasena: [t('cuenta.errores.contrasenaIncorrecta')] } };
  }
  if (regeneracion.motivo === 'bloqueado') {
    const { data: organizacion } = await sesion.supabase
      .from('organizacion')
      .select('zona_horaria')
      .maybeSingle();
    const hora = formatearHora(
      new Date(regeneracion.bloqueadoHasta),
      organizacion?.zona_horaria ?? ZONA_POR_DEFECTO,
    );
    return { ...ESTADO_INICIAL, mensaje: tCon('cuenta.errores.bloqueado', { hora }) };
  }
  return { ...ESTADO_INICIAL, mensaje: t('cuenta.errores.generico') };
}
