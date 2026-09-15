import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';

import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { FormularioDarDeBaja } from './formulario-dar-de-baja';

/**
 * Baja de un perfil (ADR-032). La pantalla **no adivina** si la baja se puede dar:
 * si la base la rechaza —por ejemplo, por ser el último administrador activo— se
 * enseña el mensaje que devuelve. Prevenirlo aquí contando administradores sería
 * una segunda copia de la regla, y la que manda está en la base.
 */
async function CargaDelFormulario() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);

  if (!estado || estado.rol !== 'administrador') {
    redirect('/ajustes');
  }

  const { data, error } = await sesion.supabase
    .from('perfiles')
    .select('id, nombre_completo, estado')
    .eq('estado', 'activo')
    .order('nombre_completo');

  if (error) {
    console.error('PaginaDarDeBaja: fallo al leer perfiles', error);
  }

  const perfiles = (data ?? [])
    .filter((perfil) => perfil.id !== sesion.usuario.id)
    .map((perfil) => ({ valor: perfil.id, etiqueta: perfil.nombre_completo }));

  return <FormularioDarDeBaja perfiles={perfiles} />;
}

export default function PaginaDarDeBaja() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{t("baja.titulo")}</h1>
        <p className="text-muted-foreground text-sm">{t("baja.descripcion")}</p>
      </header>

      <Suspense fallback={<Cargando filas={3} />}>
        <CargaDelFormulario />
      </Suspense>
    </main>
  );
}
