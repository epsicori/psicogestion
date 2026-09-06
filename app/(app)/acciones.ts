'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { COOKIE_CENTRO } from '@/components/armazon/centro';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import { exigirSesion } from '@/lib/supabase/sesion';

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  // redirect lanza NEXT_REDIRECT: siempre fuera del try.
  redirect('/login');
}

/**
 * Fija el centro activo de quien mira.
 *
 * **Comprueba que el centro es SUYO antes de guardarlo.** No porque de ello
 * dependa hoy ningún permiso —no depende: RLS acota con `centros_actuales()`, que
 * es el conjunto de centros vigentes del perfil, y una cookie no cambia eso—, sino
 * porque una preferencia que acepta cualquier identificador es una preferencia que
 * miente en cuanto alguien la edita a mano, y el día que una pantalla la lea se
 * habrá convertido en un agujero. Se valida donde se escribe, no donde se usa.
 *
 * **Dónde vive, y por qué en una cookie**: `preferencias_usuario` no tiene columna
 * de centro y añadírsela es una migración, que no es de esta entrega. La cookie es
 * la opción conservadora: no toca el esquema, se puede tirar sin migrar nada, y el
 * día que la preferencia deba durar entre dispositivos se muda con un `insert`.
 * Queda anotado en `docs/state.md`.
 */
export async function elegirCentro(datosFormulario: FormData) {
  const { supabase, usuario } = await exigirSesion();

  const centroId = datosFormulario.get('centro');
  if (typeof centroId !== 'string' || centroId === '') return;

  const hoy = new Date().toISOString().slice(0, 10);

  const { data: pertenencia } = await supabase
    .from('perfiles_centros')
    .select('centro_id')
    .eq('perfil_id', usuario.id)
    .eq('centro_id', centroId)
    .lte('desde', hoy)
    .or(`hasta.is.null,hasta.gte.${hoy}`)
    .maybeSingle();

  // Un centro que no es suyo (o cuya pertenencia ya está cerrada) no se guarda, y
  // no se avisa: no hay pantalla legítima que llegue aquí con ese valor.
  if (!pertenencia) return;

  const almacen = await cookies();
  almacen.set(COOKIE_CENTRO, centroId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}
