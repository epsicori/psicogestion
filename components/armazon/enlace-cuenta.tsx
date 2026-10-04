'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { useCerrarCajon } from './cajon';

/**
 * Entrada a «Mi cuenta» (T-038) desde el bloque de identidad del pie: la misma para los
 * tres roles. El nombre accesible empieza por «Mi cuenta» (texto solo para lectores) y
 * sigue con el nombre de la persona. Cliente porque necesita la ruta y el cierre del cajón.
 */
export function EnlaceCuenta({
  nombre,
  rolVisible,
  children,
}: {
  nombre: string;
  rolVisible: string;
  children?: ReactNode;
}) {
  const cerrarCajon = useCerrarCajon();
  const ruta = usePathname();
  const activo = ruta === '/cuenta' || ruta.startsWith('/cuenta/');

  return (
    <Link
      href="/cuenta"
      onClick={cerrarCajon}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        'hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg p-2 outline-none focus-visible:ring-2',
        activo && 'bg-secondary text-secondary-foreground',
      )}
    >
      {children}
      <span className="min-w-0 flex-1">
        <span className="sr-only">{t('armazon.miCuenta')} </span>
        <span className="block truncate text-sm font-semibold">{nombre}</span>
        <span className="text-muted-foreground block truncate text-xs">{rolVisible}</span>
      </span>
    </Link>
  );
}
