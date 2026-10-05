'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ESTADO_INICIAL, type EstadoFormulario } from '@/lib/formularios';
import { darAltaCentro, retirarAltaCentro } from '@/lib/cuentas/altas';
import { darDeBajaPerfil } from '@/lib/cuentas/baja';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { esquemaAltaCentro, esquemaBaja, esquemaInvitacion } from '@/lib/cuentas/esquemas';
import { invitarPerfil } from '@/lib/cuentas/invitar';
import { reponerTotp } from '@/lib/cuentas/totp';
import { t, tCon } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

/**
 * Las acciones de ajustes del administrador (T-006·b1; altas de centro, T-041).
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

/** `avisoPendiente`: la invitación salió pero quedan altas por dar; la pantalla no lo pinta como éxito. */
export type EstadoInvitacion = EstadoFormulario & { avisoPendiente?: true };

export async function invitar(datos: unknown): Promise<EstadoInvitacion> {
  const sesion = await exigirAdministrador();
  if (!sesion) return { ...ESTADO_INICIAL, mensaje: t('ajustes.permisos.soloAdministrador') };

  const resultado = esquemaInvitacion.safeParse(datos);
  if (!resultado.success) {
    // `flattenError` reparte los errores POR CAMPO, incluido el del `.refine` de
    // `esquemaInvitacion`, que cuelgan de `centrosIds` y `centroPrincipalId`. Escogerlos a mano de una
    // lista de campos —como hacía la primera propuesta de este formulario— deja
    // fuera precisamente ese: el técnico administrativo sin centro se quedaba sin
    // su mensaje.
    return { ...ESTADO_INICIAL, errores: z.flattenError(resultado.error).fieldErrors };
  }

  const invitacion = await invitarPerfil(sesion, resultado.data);

  // T-041: la invitación (o la cuenta) ya salió aunque alguna alta adicional no se diera; se
  // dice cuáles, por su nombre, para que el administrador la dé desde Ajustes › Altas de centro.
  async function nombresDeCentros(ids: string[]): Promise<string> {
    const { data: centros } = await sesion!.supabase.from('centros').select('id, nombre').in('id', ids);
    return ids.map((id) => centros?.find((centro) => centro.id === id)?.nombre ?? id).join(', ');
  }

  if (!invitacion.ok) {
    if (invitacion.altasSinDar && invitacion.altasSinDar.length > 0) {
      return {
        ...ESTADO_INICIAL,
        mensaje: tCon('invitar.resultados.registroConAltasPendientes', {
          mensaje: invitacion.mensaje,
          centros: await nombresDeCentros(invitacion.altasSinDar),
        }),
      };
    }
    return { ...ESTADO_INICIAL, mensaje: invitacion.mensaje };
  }

  if (invitacion.altasSinDar.length > 0) {
    return {
      ...ESTADO_INICIAL,
      mensaje: tCon('invitar.resultados.exitoConAltasPendientes', {
        correo: resultado.data.correo,
        centros: await nombresDeCentros(invitacion.altasSinDar),
      }),
      avisoPendiente: true,
    };
  }

  return { ...ESTADO_INICIAL, mensaje: tCon('invitar.resultados.exito', { correo: resultado.data.correo }) };
}

/**
 * Dar y retirar altas de centro de quien atiende (T-041). La comprobación de rol aquí es
 * cortesía: la que manda está en `dar_alta_centro()` / `retirar_alta_centro()`, que lanzan
 * 42501 a quien no es administrador.
 */
/** `ok` distingue el éxito del rechazo: el diálogo de `/ajustes/centros` solo se cierra con él. */
export type EstadoAlta = EstadoFormulario & { ok?: true };

export async function darAltaDeCentro(datos: unknown): Promise<EstadoAlta> {
  const sesion = await exigirAdministrador();
  if (!sesion) return { ...ESTADO_INICIAL, mensaje: t('ajustes.permisos.soloAdministrador') };

  const resultado = esquemaAltaCentro.safeParse(datos);
  if (!resultado.success) {
    return { ...ESTADO_INICIAL, errores: z.flattenError(resultado.error).fieldErrors };
  }

  const alta = await darAltaCentro(sesion, resultado.data);
  if (!alta.ok) return { ...ESTADO_INICIAL, mensaje: alta.mensaje };

  revalidatePath('/ajustes/centros');
  return { ...ESTADO_INICIAL, ok: true, mensaje: t('altasCentro.resultados.dada') };
}

export async function retirarAltaDeCentro(datos: unknown): Promise<EstadoAlta> {
  const sesion = await exigirAdministrador();
  if (!sesion) return { ...ESTADO_INICIAL, mensaje: t('ajustes.permisos.soloAdministrador') };

  const resultado = esquemaAltaCentro.safeParse(datos);
  if (!resultado.success) {
    return { ...ESTADO_INICIAL, errores: z.flattenError(resultado.error).fieldErrors };
  }

  const retirada = await retirarAltaCentro(sesion, resultado.data);
  if (!retirada.ok) return { ...ESTADO_INICIAL, mensaje: retirada.mensaje };

  revalidatePath('/ajustes/centros');
  return { ...ESTADO_INICIAL, ok: true, mensaje: t('altasCentro.resultados.retirada') };
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
