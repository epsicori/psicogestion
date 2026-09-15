'use server';

import { z } from 'zod';

import { ESTADO_INICIAL, type EstadoFormulario } from '@/lib/formularios';
import { darDeBajaPerfil } from '@/lib/cuentas/baja';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { esquemaBaja, esquemaInvitacion } from '@/lib/cuentas/esquemas';
import { invitarPerfil } from '@/lib/cuentas/invitar';
import { reponerTotp } from '@/lib/cuentas/totp';
import { t, tCon } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

/**
 * Las tres acciones de ajustes del administrador (T-006·b1).
 *
 * Las tres comprueban la autorización POR DENTRO —`exigirSesion()` y el rol— y no
 * la heredan de la pantalla: una Server Action es un punto de entrada público y
 * quien la llama puede no venir de la página que la ofrece. Que `/ajustes` esconda
 * el enlace a un profesional es comodidad; esto es lo que manda.
 *
 * Y las tres reciben `unknown` aunque el formulario valide con el mismo esquema en
 * cliente, por el mismo motivo: lo que llega por ahí no está validado por
 * definición (mismo patrón que `app/login/acciones.ts`).
 */
async function exigirAdministrador() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);
  if (!estado || estado.rol !== 'administrador') return null;
  return sesion;
}

export async function invitar(datos: unknown): Promise<EstadoFormulario> {
  const sesion = await exigirAdministrador();
  if (!sesion) return { ...ESTADO_INICIAL, mensaje: t('ajustes.permisos.soloAdministrador') };

  const resultado = esquemaInvitacion.safeParse(datos);
  if (!resultado.success) {
    // `flattenError` reparte los errores POR CAMPO, incluido el del `.refine` de
    // `esquemaInvitacion`, que cuelga de `centroId`. Escogerlos a mano de una
    // lista de campos —como hacía la primera propuesta de este formulario— deja
    // fuera precisamente ese: el técnico administrativo sin centro se quedaba sin
    // su mensaje.
    return { ...ESTADO_INICIAL, errores: z.flattenError(resultado.error).fieldErrors };
  }

  const invitacion = await invitarPerfil(sesion, resultado.data);
  if (!invitacion.ok) {
    return { ...ESTADO_INICIAL, mensaje: invitacion.mensaje };
  }

  return { ...ESTADO_INICIAL, mensaje: tCon('invitar.resultados.exito', { correo: resultado.data.correo }) };
}

const esquemaReponerTotp = z.object({ perfilId: z.uuid() });

export async function reponerTotpDePerfil(datos: unknown): Promise<EstadoFormulario> {
  const sesion = await exigirAdministrador();
  if (!sesion) return { ...ESTADO_INICIAL, mensaje: t('ajustes.permisos.soloAdministrador') };

  const resultado = esquemaReponerTotp.safeParse(datos);
  if (!resultado.success) {
    return { ...ESTADO_INICIAL, errores: z.flattenError(resultado.error).fieldErrors };
  }

  const reposicion = await reponerTotp(sesion, { perfilId: resultado.data.perfilId });
  if (!reposicion.ok) {
    return { ...ESTADO_INICIAL, mensaje: reposicion.mensaje };
  }

  return { ...ESTADO_INICIAL, mensaje: t('ajustes.resultados.totpRepuesto') };
}

export async function darDeBaja(datos: unknown): Promise<EstadoFormulario> {
  const sesion = await exigirAdministrador();
  if (!sesion) return { ...ESTADO_INICIAL, mensaje: t('ajustes.permisos.soloAdministrador') };

  const resultado = esquemaBaja.safeParse(datos);
  if (!resultado.success) {
    return { ...ESTADO_INICIAL, errores: z.flattenError(resultado.error).fieldErrors };
  }

  const baja = await darDeBajaPerfil(sesion, resultado.data);
  if (!baja.ok) {
    // El mensaje viene de la base —incluido el del último administrador activo—.
    // La pantalla lo ENSEÑA; no adivina cuántos administradores quedan para
    // prevenirlo, que es lo que pide el ticket.
    return { ...ESTADO_INICIAL, mensaje: baja.mensaje };
  }

  return { ...ESTADO_INICIAL, mensaje: t('baja.resultados.exito') };
}
