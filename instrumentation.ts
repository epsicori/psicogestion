/**
 * T-033 · capa 1 del modo local del segundo factor: se evalúa al arrancar la instancia.
 *
 * Si `SEGUNDO_FACTOR_AUTOMATICO_LOCAL` está puesta y Supabase no es local, la evaluación
 * lanza `ErrorModoLocal` y `register()` lo propaga. En `next dev` el proceso termina; en
 * `next start` Next registra «Failed to prepare server» y cada petición da 500 (comprobado
 * en la verificación de T-033). En los dos casos no se sirve nada. SIN try/catch a
 * propósito: tragarse el error anularía la capa.
 * No se llama en `next build`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { segundoFactorAutomaticoActivo } = await import('./lib/cuentas/modo-desarrollo');
  if (segundoFactorAutomaticoActivo()) {
    console.warn(
      '[modo local] El segundo factor se supera solo con las cuentas sembradas. ' +
        'Nunca en un entorno real.',
    );
  }
}
