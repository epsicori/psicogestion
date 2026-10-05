import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';

import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { cargarAltas } from './carga';
import { GestionAltas } from './gestion-altas';

/**
 * Altas de centro (T-041). Solo administrador y profesional: el técnico tiene un único
 * centro y se cambia por su propio camino; `dar_alta_centro()` lo rechaza con 23514.
 *
 * Todo se lee y se formatea **en servidor** y baja como filas planas: el cliente no
 * consulta la base ni formatea fechas. Lo que manda está en las RPC, que lanzan 42501 a
 * quien no es administrador; el `redirect` de aquí es cortesía.
 */
async function CargaDeAltas() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);

  if (!estado || estado.rol !== 'administrador') {
    redirect('/ajustes');
  }

  const carga = await cargarAltas(sesion.supabase);
  if (!carga.ok) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('altasCentro.errorLectura')}
      </p>
    );
  }

  return <GestionAltas personas={carga.personas} centros={carga.centros} />;
}

export default function PaginaAltasDeCentro() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('altasCentro.titulo')}</h1>
        <p className="text-muted-foreground text-sm">{t('altasCentro.descripcion')}</p>
      </header>

      <Suspense fallback={<Cargando filas={3} />}>
        <CargaDeAltas />
      </Suspense>
    </main>
  );
}
