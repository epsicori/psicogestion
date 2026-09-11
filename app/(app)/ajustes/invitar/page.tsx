import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';

import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { FormularioInvitar } from './formulario-invitar';

/**
 * Los centros se leen **en servidor** y bajan como propiedad: el formulario no abre
 * un cliente de navegador ni consulta la base desde el efecto de montaje. Lo que ve
 * el usuario ya viene decidido por RLS, y la pantalla no parpadea con una lista
 * vacía mientras carga.
 */
async function CargaDelFormulario() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);

  if (!estado || estado.rol !== 'administrador') {
    redirect('/ajustes');
  }

  const { data, error } = await sesion.supabase
    .from('centros')
    .select('id, nombre')
    .order('nombre');

  if (error) {
    console.error('PaginaInvitar: fallo al leer centros', error);
  }

  const centros = (data ?? []).map((centro) => ({ valor: centro.id, etiqueta: centro.nombre }));

  return <FormularioInvitar centros={centros} />;
}

export default function PaginaInvitar() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{t("invitar.titulo")}</h1>
        <p className="text-muted-foreground text-sm">{t("invitar.descripcion")}</p>
      </header>

      <Suspense fallback={<Cargando filas={3} />}>
        <CargaDelFormulario />
      </Suspense>
    </main>
  );
}
