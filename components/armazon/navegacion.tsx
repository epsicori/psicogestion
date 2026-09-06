'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { useCerrarCajon } from './cajon';
import { modulosDe, type Modulo, type RolUsuario } from './modulos';

/**
 * La navegación recibe **el rol**, una cadena, y filtra ella misma con
 * `modulosDe()`. No recibe la lista ya filtrada a propósito: cada `Modulo` lleva
 * un componente de icono (`LucideIcon`), y **un componente no cruza la frontera
 * entre servidor y cliente** —no es serializable—. Mandar el rol y filtrar aquí
 * evita esa frontera sin duplicar la regla, porque `modulosDe()` es la misma
 * función que se prueba en `modulos.test.ts`.
 */
export function Navegacion({ rol }: { rol: RolUsuario | null }) {
  const modulos = modulosDe(rol);

  return (
    <nav className="flex flex-col gap-1" aria-label={t('armazon.navegacionPrincipal')}>
      {modulos.map((modulo) => (
        <EnlaceModulo key={modulo.href} {...modulo} />
      ))}
    </nav>
  );
}

function EnlaceModulo({ etiqueta, href, icono: Icono, disponible }: Modulo) {
  const cerrarCajon = useCerrarCajon();
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
      onClick={cerrarCajon}
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
