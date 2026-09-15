import { Activity } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';
import { primerAccesoPendiente } from '@/lib/cuentas/primer-acceso';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { FormularioPin } from './formulario-pin';
import { SegundoFactor } from './segundo-factor';

/**
 * El primer acceso (T-006·b2). **Vive fuera del grupo `(app)` a propósito**, y no
 * es una cuestión de gusto: la guardia que manda aquí a quien le falta un paso está
 * en `proxy.ts`, y si esta pantalla colgara del mismo grupo se redirigiría a sí
 * misma en bucle. Además, enseñar la barra lateral con módulos que todavía no se
 * pueden usar mientras alguien enrola su segundo factor es enseñar de más.
 *
 * Quién decide en qué paso está cada usuario es la base —`primerAccesoPendiente()`,
 * sobre el nivel de la sesión y `estado_de_cuenta()`—, nunca un condicional de
 * cliente.
 */
async function PasoPendiente() {
  const sesion = await exigirSesion();
  const paso = await primerAccesoPendiente(sesion.supabase);

  if (!paso) {
    // No le falta nada: aquí no pinta nada.
    redirect('/');
  }

  if (paso === 'totp') {
    // Con un factor verificado ya enrolado, lo que falta es superarlo hoy; sin
    // factor, hay que crearlo. La pantalla lo distingue porque es quien puede
    // listar los factores; la guardia no necesita saberlo.
    const { data: factores } = await sesion.supabase.auth.mfa.listFactors();
    const verificado = factores?.totp?.find((factor) => factor.status === 'verified') ?? null;

    return <SegundoFactor factorVerificadoId={verificado?.id ?? null} />;
  }

  return <FormularioPin />;
}

export default function PaginaPrimeraVez() {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="bg-primary text-primary-foreground mb-4 flex size-11 items-center justify-center rounded-xl">
            <Activity className="size-6" />
          </div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('marca')}</h1>
          <p className="text-muted-foreground mt-1 text-[11px] tracking-[0.18em] uppercase">
            {t('primeraVez.eyebrow')}
          </p>
        </div>

        <div className="border-border bg-card rounded-xl border p-6 shadow-sm">
          <Suspense fallback={<Cargando filas={4} />}>
            <PasoPendiente />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
