'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { anadirDescartada, parsearDescartadas } from '@/lib/agenda/avisos';
import { exigirSesion } from '@/lib/supabase/sesion';

import { COOKIE_FRANJAS_DESCARTADAS } from './avisos-constantes';

const esquemaId = z.uuid();

/**
 * Oculta la franja de una sesión en curso hasta que se cierre el navegador (T-015, D10).
 *
 * No comprueba que la cita sea del usuario: es una preferencia de presentación que solo
 * oculta, y un id ajeno no da acceso a nada. Cookie de sesión del navegador: sin `maxAge`
 * ni `expires`. Sin `revalidatePath`: el cliente ya ha ocultado la franja.
 */
export async function descartarFranja(citaId: string): Promise<void> {
  await exigirSesion();
  const validado = esquemaId.safeParse(citaId);
  if (!validado.success) return;

  const almacen = await cookies();
  const lista = anadirDescartada(
    parsearDescartadas(almacen.get(COOKIE_FRANJAS_DESCARTADAS)?.value),
    validado.data,
  );
  almacen.set(COOKIE_FRANJAS_DESCARTADAS, lista.join(','), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

/** Marca una notificación como leída. El instante lo pone la base (`now()`), no este valor. */
export async function marcarNotificacionLeida(id: string): Promise<{ ok: boolean }> {
  const { supabase } = await exigirSesion();
  const validado = esquemaId.safeParse(id);
  if (!validado.success) return { ok: false };

  const { error } = await supabase
    .from('notificaciones')
    .update({ leida_en: new Date().toISOString() })
    .eq('id', validado.data)
    .is('leida_en', null);
  if (error) {
    console.error('marcarNotificacionLeida: fallo al actualizar notificaciones', error);
    return { ok: false };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Marca como leídas todas las notificaciones sin leer del usuario. */
export async function marcarTodasLeidas(): Promise<{ ok: boolean }> {
  const { supabase, usuario } = await exigirSesion();

  const { error } = await supabase
    .from('notificaciones')
    .update({ leida_en: new Date().toISOString() })
    .eq('perfil_id', usuario.id)
    .is('leida_en', null);
  if (error) {
    console.error('marcarTodasLeidas: fallo al actualizar notificaciones', error);
    return { ok: false };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
