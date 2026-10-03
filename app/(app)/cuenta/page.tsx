import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { FormularioRegenerar } from './formulario-regenerar';
import { ListaAvisos } from './lista-avisos';

/**
 * Mi cuenta (T-038): lo que cada persona hace sobre SU propia cuenta, igual para los tres
 * roles. No lleva selector de perfil —regenerar los códigos de otro no existe— ni nada que
 * no tenga un dato o una acción detrás. La sesión se lee detrás de su `<Suspense>`: el
 * encabezado se prerenderiza y solo esto espera (patrón de `/ajustes`).
 */
async function Seguridad() {
  const sesion = await exigirSesion();

  return (
    <div className="flex flex-col gap-8">
      <FormularioRegenerar />
      <ListaAvisos sesion={sesion} />
    </div>
  );
}

export default function PaginaCuenta() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('cuenta.titulo')}</h1>
      </header>

      <section aria-labelledby="cuenta-seguridad" className="flex flex-col gap-6">
        <h2 id="cuenta-seguridad" className="text-lg font-semibold">
          {t('cuenta.seguridad')}
        </h2>
        <Suspense fallback={<Cargando filas={3} />}>
          <Seguridad />
        </Suspense>
      </section>
    </main>
  );
}
