/**
 * Nombre de la cookie de franjas de sesión descartadas (T-015).
 *
 * Vive aparte de `acciones-avisos.ts` por la misma razón que `centro.ts`: un fichero con
 * `'use server'` solo puede exportar funciones asíncronas.
 */
export const COOKIE_FRANJAS_DESCARTADAS = 'franjas_descartadas';
