import 'server-only';

import { crearClienteAdministracion } from '../supabase/administracion';
import type { DatosInvitacion } from './esquemas';
import type { Sesion } from './tipos';

export type ResultadoInvitacion =
  | { ok: true; perfilId: string; altasSinDar: string[] }
  | { ok: false; motivo: string; mensaje: string; altasSinDar?: string[] };

/**
 * Invita a un perfil nuevo. Encadena cuatro pasos, EN ESTE ORDEN, y ninguno se salta:
 *
 * 1. `preparar_invitacion()` — valida CONTRA LA BASE (rol administrador, técnico exige
 *    centro existente) ANTES de gastar un envío de correo. No escribe nada. (T-041) Se
 *    repite por cada centro de `centrosIds` —una sola llamada con centro nulo si no hay
 *    ninguno—, y TODAS van antes del envío: al primer rechazo no se ha enviado nada.
 * 2. `auth.admin.inviteUserByEmail()` — con el cliente de administracion.ts. Crea
 *    `auth.users`, lo que dispara `fn_crear_perfil_de_usuario()` (T-002) BAJO
 *    `supabase_auth_admin`, con `actor_id` nulo: ese disparador da de alta `perfiles` y
 *    (si hay centro) la pertenencia principal. `raw_user_meta_data` lleva las mismas
 *    claves que ese disparador espera: `rol`, `centro_id`, `nombre_completo`.
 * 3. `registrar_invitacion()` — YA con la sesión real del administrador, deja
 *    constancia en `auditoria` de quién invitó. Va después porque necesita el
 *    `perfilId` que solo existe tras el paso 2.
 * 4. (T-041) `dar_alta_centro()` por cada centro de `centrosIds` que no sea el principal,
 *    con la sesión del administrador y NUNCA con el cliente de administración: la RPC
 *    comprueba el rol de quien llama, y con la clave de servicio `rol_actual()` es nulo.
 *    Si alguna falla, la invitación ya salió y no se deshace: se devuelve `ok` con los
 *    centros sin alta (`altasSinDar`) para que la pantalla lo diga.
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
  const centrosAValidar: (string | null)[] =
    entrada.centrosIds.length > 0 ? entrada.centrosIds : [null];
  for (const centroId of centrosAValidar) {
    const { error: errorPreparar } = await sesion.supabase.rpc('preparar_invitacion', {
      p_rol: entrada.rol,
      // El generador de tipos no modela la nulabilidad de un argumento `uuid`: la función
      // SQL sí acepta null (es justo el caso que dispara el rechazo del técnico sin
      // centro), así que aquí se afirma explícitamente.
      p_centro_id: centroId as string,
    });
    if (errorPreparar) {
      console.error('invitarPerfil: preparar_invitacion() rechazó la invitación', errorPreparar);
      return {
        ok: false,
        motivo: 'preparacion',
        mensaje: 'No se pudo preparar la invitación. Revisa el rol y el centro.',
      };
    }
  }

  // `preparar_invitacion()` no mira `centros.activo` y el formulario se cargó antes de que
  // otro administrador pudiera cerrar un centro: se comprueba aquí, antes de crear la cuenta.
  // Un principal cerrado dejaría a la persona con sus pacientes futuros en un centro cerrado.
  if (entrada.centrosIds.length > 0) {
    const { data: abiertos, error: errorCentros } = await sesion.supabase
      .from('centros')
      .select('id, activo')
      .in('id', entrada.centrosIds);
    const todosAbiertos =
      !errorCentros &&
      entrada.centrosIds.every((id) => abiertos?.some((c) => c.id === id && c.activo));
    if (!todosAbiertos) {
      if (errorCentros) console.error('invitarPerfil: no se pudo leer centros', errorCentros);
      return {
        ok: false,
        motivo: 'centro',
        mensaje: 'Un centro elegido ya no está abierto. Recarga la pantalla y revisa los centros.',
      };
    }
  }

  const administracion = crearClienteAdministracion();
  const { data, error: errorInvitar } = await administracion.auth.admin.inviteUserByEmail(
    entrada.correo,
    {
      data: {
        rol: entrada.rol,
        // El principal ELEGIDO, nunca centrosIds[0]: el disparador lo da de alta como
        // principal, y decide dónde quedan sus pacientes futuros (ADR-033).
        centro_id: entrada.centroPrincipalId,
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
    // Las altas adicionales no se intentan, y se dice cuáles: la persona existe solo con su
    // principal y nada más la llevaría a Ajustes › Altas de centro.
    return {
      ok: false,
      motivo: 'registro',
      mensaje: 'La cuenta se creó, pero no se pudo dejar constancia de la invitación.',
      altasSinDar: entrada.centrosIds.filter((id) => id !== entrada.centroPrincipalId),
    };
  }

  const altasSinDar: string[] = [];
  for (const centroId of entrada.centrosIds) {
    if (centroId === entrada.centroPrincipalId) continue;
    const { error: errorAlta } = await sesion.supabase.rpc('dar_alta_centro', {
      p_perfil_id: perfilId,
      p_centro_id: centroId,
    });
    if (errorAlta) {
      console.error('invitarPerfil: dar_alta_centro() falló tras crear el perfil', errorAlta);
      altasSinDar.push(centroId);
    }
  }

  return { ok: true, perfilId, altasSinDar };
}
