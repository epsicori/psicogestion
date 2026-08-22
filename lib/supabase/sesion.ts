import { redirect } from 'next/navigation';

import { crearClienteServidor } from './servidor';

/**
 * `getUser()`, nunca `getSession()`: getSession() no valida el token contra el
 * servidor de Auth, solo lee la cookie. Regla para el resto del proyecto.
 */
export async function obtenerUsuario() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, usuario: user };
}

/**
 * Para Server Actions: la autorización se comprueba dentro de la acción, nunca se
 * hereda del Proxy (que es solo una guardia optimista).
 */
export async function exigirSesion() {
  const { supabase, usuario } = await obtenerUsuario();
  if (!usuario) {
    redirect('/login');
  }
  return { supabase, usuario };
}
