import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { FormularioCandado } from './formulario-candado';

/**
 * El candado de la historia clínica (ADR-026). Es una pantalla propia, para fijar o
 * reabrir la ventana sin tener un paciente delante; desde T-013 la ficha lleva su
 * propia petición de PIN dentro de la pestaña, así que ya no manda aquí para volver.
 *
 * El técnico administrativo **no tiene historia que abrir** y por tanto no tiene
 * PIN: `requiere_pin` es falso para él en la base, y aquí no pinta nada.
 */
async function Candado() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);

  if (!estado?.requierePin) {
    redirect('/');
  }

  return <FormularioCandado caducaEnInicial={estado.desbloqueoCaducaEn} />;
}

export default function PaginaCandado() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('candado.titulo')}</h1>
        <p className="text-muted-foreground text-sm">{t('candado.subtitulo')}</p>
      </header>

      <div className="border-border bg-card rounded-xl border p-6 shadow-sm">
        <Suspense fallback={<Cargando filas={3} />}>
          <Candado />
        </Suspense>
      </div>
    </main>
  );
}
