'use client';

import { Activity, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { t } from '@/lib/i18n';

import { cn } from '@/lib/utils';

import { MODULOS } from './modulos';

type Props = {
  /**
   * Bloques que RESUELVE EL SERVIDOR y llegan ya envueltos en su `<Suspense>`.
   * Son ranuras, no cadenas: si fueran cadenas, este componente tendría que
   * esperar a que la sesión estuviera resuelta para poder pintar el marco, y el
   * marco no depende de la sesión.
   */
  identidad: ReactNode;
  saludo: ReactNode;
  children: ReactNode;
};

export function ArmazonCliente({ identidad, saludo, children }: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Velo del cajón en móvil. */}
      {menuAbierto && (
        <button
          type="button"
          aria-label={t('armazon.cerrarMenu')}
          onClick={() => setMenuAbierto(false)}
          className="bg-foreground/30 fixed inset-0 z-30 lg:hidden"
        />
      )}

      <aside
        className={cn(
          'bg-card border-border fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r',
          'transition-transform lg:static lg:translate-x-0',
          menuAbierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-border flex h-20 items-center gap-3 border-b px-6">
          <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-xl">
            <Activity className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-lg font-semibold tracking-tight">{t('marca')}</p>
            <p className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">
              {t('lema')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('armazon.cerrarMenu')}
            onClick={() => setMenuAbierto(false)}
            className="hover:bg-muted rounded-lg p-2 lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col px-3 py-6">
          <p className="text-muted-foreground px-3 pb-3 text-[11px] font-semibold tracking-[0.16em] uppercase">
            {t('armazon.espacioDeTrabajo')}
          </p>
          <nav className="flex flex-col gap-1" aria-label={t('armazon.navegacionPrincipal')}>
            {MODULOS.map((modulo) => (
              <EnlaceModulo
                key={modulo.href}
                {...modulo}
                onNavegar={() => setMenuAbierto(false)}
              />
            ))}
          </nav>
        </div>

        <div className="border-border border-t p-4">{identidad}</div>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="border-border bg-card/90 flex h-20 items-center justify-between border-b px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              className="hover:bg-muted rounded-lg p-2 lg:hidden"
              aria-label={t('armazon.abrirMenu')}
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">{saludo}</div>
          </div>
        </header>

        <div className="mx-auto max-w-[1480px] px-5 py-6 md:px-8 md:py-8">{children}</div>
      </section>
    </div>
  );
}

function EnlaceModulo({
  etiqueta,
  href,
  icono: Icono,
  disponible,
  onNavegar,
}: (typeof MODULOS)[number] & { onNavegar: () => void }) {
  const ruta = usePathname();
  const activo = ruta === href || ruta.startsWith(`${href}/`);
  const clases = 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition';

  if (!disponible) {
    return (
      <span
        aria-disabled="true"
        className={cn(clases, 'text-muted-foreground/50 cursor-not-allowed')}
      >
        <Icono className="size-4" />
        {etiqueta}
        <span className="bg-muted text-muted-foreground ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold">
          {t('armazon.proximamente')}
        </span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavegar}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        clases,
        activo
          ? 'bg-secondary text-secondary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icono className="size-4" />
      {etiqueta}
    </Link>
  );
}
