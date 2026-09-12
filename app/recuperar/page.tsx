import { Activity } from 'lucide-react';

import { t } from '@/lib/i18n';

import { FormularioRecuperar } from './formulario-recuperar';

/**
 * Para quien perdió el segundo factor. **Vive fuera del grupo `(app)` y está exenta
 * de la guardia del primer acceso** (`proxy.ts`), y esa exención es el motivo de que
 * la pantalla sirva de algo: quien ha perdido el TOTP entra con contraseña, se queda
 * en `aal1`, y la guardia lo manda a `/primera-vez` — donde no puede hacer nada,
 * porque su factor sigue ahí y no tiene cómo superarlo. Sin la exención, esta
 * pantalla existiría y **nadie podría llegar a ella**.
 *
 * No es pública: sigue exigiendo sesión, porque un código de recuperación solo vale
 * para la cuenta que ya ha demostrado su contraseña.
 */
export default function PaginaRecuperar() {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="bg-primary text-primary-foreground mb-4 flex size-11 items-center justify-center rounded-xl">
            <Activity className="size-6" />
          </div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('marca')}</h1>
          <p className="text-muted-foreground mt-1 text-[11px] tracking-[0.18em] uppercase">
            {t('recuperar.eyebrow')}
          </p>
        </div>

        <div className="border-border bg-card rounded-xl border p-6 shadow-sm">
          <FormularioRecuperar />
        </div>
      </div>
    </div>
  );
}
