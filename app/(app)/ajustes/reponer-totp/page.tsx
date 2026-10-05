import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';

import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { cargarPerfilesActivos } from '../perfiles-activos';
import { FormularioReponerTotp } from './formulario-reponer-totp';

/**
 * Reponer el TOTP de OTRO perfil (ADR-039). **Reponer el PIN de otro no existe**:
 * ni aquí, ni en ninguna otra pantalla, ni como acción. Si aparece alguna vez, es
 * un hallazgo y no una función.
 *
 * La lista de perfiles se lee en servidor; RLS decide cuáles ve quien mira.
 */
async function CargaDelFormulario() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);

  if (!estado || estado.rol !== 'administrador') {
    redirect('/ajustes');
  }

  const carga = await cargarPerfilesActivos(sesion.supabase, sesion.usuario.id);

  if (!carga.ok) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('ajustes.resultados.errorLecturaUsuarios')}
      </p>
    );
  }

  return <FormularioReponerTotp perfiles={carga.perfiles} />;
}

export default function PaginaReponerTotp() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{t("totp.titulo")}</h1>
        <p className="text-muted-foreground text-sm">{t("totp.descripcion")}</p>
      </header>

      <Suspense fallback={<Cargando filas={3} />}>
        <CargaDelFormulario />
      </Suspense>
    </main>
  );
}
