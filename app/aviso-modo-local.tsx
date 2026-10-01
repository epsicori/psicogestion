import { connection } from 'next/server';

import { segundoFactorAutomaticoActivo } from '@/lib/cuentas/modo-desarrollo';
import { t } from '@/lib/i18n';

/**
 * T-033 · franja permanente mientras el segundo factor se supera solo (desarrollo local).
 *
 * `connection()` va ANTES de leer el modo: con Cache Components el layout se prerenderiza,
 * y sin esa espera la franja se decidiría en `next build` (un build sin la variable,
 * arrancado con ella, tendría el modo activo y ningún aviso). Va dentro de `<Suspense>`
 * en `app/layout.tsx`, así que el resto del documento sigue estático.
 *
 * Sin botón de cerrar (no hay acción real que hacer con él) y sin `role="alert"`: se
 * anunciaría en cada página.
 */
export async function AvisoModoLocal() {
  await connection();
  if (!segundoFactorAutomaticoActivo()) return null;

  return (
    <div className="bg-destructive text-destructive-foreground w-full px-4 py-2 text-center text-sm font-medium">
      <p>{t('modoLocal.aviso')}</p>
    </div>
  );
}
