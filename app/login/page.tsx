import { Activity } from 'lucide-react';

import { t } from '@/lib/i18n';

import { FormularioLogin } from './formulario-login';

export default function PaginaLogin() {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="bg-primary text-primary-foreground mb-4 flex size-11 items-center justify-center rounded-xl">
            <Activity className="size-6" />
          </div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('marca')}</h1>
          <p className="text-muted-foreground mt-1 text-[11px] tracking-[0.18em] uppercase">
            {t('lema')}
          </p>
        </div>

        <div className="border-border bg-card rounded-xl border p-6 shadow-sm">
          <h2 className="mb-5 font-serif text-xl font-semibold tracking-tight">{t('acceso.iniciarSesion')}</h2>
          <FormularioLogin />
        </div>
      </div>
    </div>
  );
}
