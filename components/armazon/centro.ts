/**
 * Nombre de la cookie del centro activo.
 *
 * Vive en su propio módulo y no en `app/(app)/acciones.ts` por una regla del
 * framework que cuesta un build descubrir: **un fichero con `'use server'` solo
 * puede exportar funciones asíncronas**. Una constante ahí no es un error de
 * tipos, es un módulo que se queda literalmente sin exportaciones —«The module
 * has no exports at all»— y el import falla en el sitio equivocado.
 */
export const COOKIE_CENTRO = 'centro_activo';
