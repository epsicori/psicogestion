import Link from 'next/link';
import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';


/**
 * El bloque de administración depende de la sesión, así que vive detrás de su
 * `<Suspense>`: el encabezado se prerenderiza y llega instantáneo, y solo esto
 * espera (mismo patrón que `app/(app)/pacientes/page.tsx`).
 *
 * A quien no es administrador **no se le envía el bloque**: no está oculto ni en
 * gris. Un control deshabilitado revela que existe.
 */
async function AccesosDeAdministracion() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);

  if (estado?.rol !== 'administrador') return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t('ajustes.secciones.administracion')}</h2>
      <ul className="flex flex-col gap-2">
        <li>
          <Link
            href="/ajustes/invitar"
            className="border-border hover:bg-muted focus-visible:ring-ring/50 block rounded-lg border px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2"
          >
            {t('ajustes.acciones.invitaciones')}
          </Link>
        </li>
        <li>
          <Link
            href="/ajustes/reponer-totp"
            className="border-border hover:bg-muted focus-visible:ring-ring/50 block rounded-lg border px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2"
          >
            {t('ajustes.acciones.reponerTotp')}
          </Link>
        </li>
        <li>
          <Link
            href="/ajustes/dar-de-baja"
            className="border-border hover:bg-muted focus-visible:ring-ring/50 block rounded-lg border px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2"
          >
            {t('ajustes.acciones.darDeBaja')}
          </Link>
        </li>
        <li>
          <Link
            href="/ajustes/centros"
            className="border-border hover:bg-muted focus-visible:ring-ring/50 block rounded-lg border px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2"
          >
            {t('ajustes.acciones.altasCentro')}
          </Link>
        </li>
        <li>
          <Link
            href="/ajustes/facturacion"
            className="border-border hover:bg-muted focus-visible:ring-ring/50 block rounded-lg border px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2"
          >
            {t('ajustes.acciones.programaFacturacion')}
          </Link>
        </li>
      </ul>
    </section>
  );
}

export default function PaginaAjustes() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('ajustes.titulo')}</h1>
        <p className="text-muted-foreground text-sm">{t('ajustes.subtitulo')}</p>
      </header>

      <Suspense fallback={<Cargando filas={3} />}>
        <AccesosDeAdministracion />
      </Suspense>
    </main>
  );
}
