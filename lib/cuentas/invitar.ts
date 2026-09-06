import 'server-only';

import { crearClienteAdministracion } from '../supabase/administracion';
import type { DatosInvitacion } from './esquemas';
import type { Sesion } from './tipos';

export type ResultadoInvitacion =
  | { ok: true; perfilId: string }
  | { ok: false; motivo: string; mensaje: string };

/**
 * Invita a un perfil nuevo. Encadena tres pasos, EN ESTE ORDEN, y ninguno se salta:
 *
 * 1. `preparar_invitacion()` — valida CONTRA LA BASE (rol administrador, técnico exige
 *    centro existente) ANTES de gastar un envío de correo. No escribe nada.
 * 2. `auth.admin.inviteUserByEmail()` — con el cliente de administracion.ts. Crea
 *    `auth.users`, lo que dispara `fn_crear_perfil_de_usuario()` (T-002) BAJO
 *    `supabase_auth_admin`, con `actor_id` nulo: ese disparador da de alta `perfiles` y
 *    (si hay centro) la pertenencia principal. `raw_user_meta_data` lleva las mismas
 *    claves que ese disparador espera: `rol`, `centro_id`, `nombre_completo`.
 * 3. `registrar_invitacion()` — YA con la sesión real del administrador, deja
 *    constancia en `auditoria` de quién invitó. Va después porque necesita el
 *    `perfilId` que solo existe tras el paso 2.
 *
 * Si el paso 2 falla, no hay perfil que registrar y no se llega al paso 3. Si el
 * paso 3 fallara (no debería: ya se validó rol y existencia en el paso 1), el perfil
 * ya existe pero sin la fila de auditoría de quién invitó — un caso residual que se
 * reporta, no se deshace: el alta de auth.users no es de esta aplicación quien la
 * revierte.
 */
export async function invitarPerfil(
  sesion: Sesion,
  entrada: DatosInvitacion,
): Promise<ResultadoInvitacion> {
  const { error: errorPreparar } = await sesion.supabase.rpc('preparar_invitacion', {
    p_rol: entrada.rol,
    // El generador de tipos no modela la nulabilidad de un argumento `uuid`: la función
    // SQL sí acepta null (es justo el caso que dispara el rechazo del técnico sin
    // centro), así que aquí se afirma explícitamente.
    p_centro_id: entrada.centroId as string,
  });
  if (errorPreparar) {
    console.error('invitarPerfil: preparar_invitacion() rechazó la invitación', errorPreparar);
    return {
      ok: false,
      motivo: 'preparacion',
      mensaje: 'No se pudo preparar la invitación. Revisa el rol y el centro.',
    };
  }

  const administracion = crearClienteAdministracion();
  const { data, error: errorInvitar } = await administracion.auth.admin.inviteUserByEmail(
    entrada.correo,
    {
      data: {
        rol: entrada.rol,
        centro_id: entrada.centroId,
        nombre_completo: entrada.nombreCompleto,
      },
    },
  );
  if (errorInvitar || !data.user) {
    console.error('invitarPerfil: inviteUserByEmail() falló', errorInvitar);
    return {
      ok: false,
      motivo: 'invitacion',
      mensaje: 'No se pudo enviar la invitación por correo.',
    };
  }

  const perfilId = data.user.id;

  const { error: errorRegistrar } = await sesion.supabase.rpc('registrar_invitacion', {
    p_perfil_id: perfilId,
  });
  if (errorRegistrar) {
    // El perfil ya existe (paso 2 tuvo éxito): no se deshace nada, se reporta el fallo
    // residual de auditoría para que quede constancia por otra vía si hace falta.
    console.error('invitarPerfil: registrar_invitacion() falló tras crear el perfil', errorRegistrar);
    return {
      ok: false,
      motivo: 'registro',
      mensaje: 'La cuenta se creó, pero no se pudo dejar constancia de la invitación.',
    };
  }

  return { ok: true, perfilId };
}
