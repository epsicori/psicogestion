import { CalendarDays, Settings2, Users, WalletCards, type LucideIcon } from 'lucide-react';

import { t } from '@/lib/i18n';

/** Los tres roles de `perfiles.rol` (`docs/architecture.md` §Roles). */
export type RolUsuario = 'administrador' | 'profesional_sanitario' | 'tecnico_administrativo';

const TODOS_LOS_ROLES: readonly RolUsuario[] = [
  'administrador',
  'profesional_sanitario',
  'tecnico_administrativo',
];

export type Modulo = {
  etiqueta: string;
  href: string;
  icono: LucideIcon;
  /** Falso mientras el ticket que construye el módulo no esté integrado. */
  disponible: boolean;
  /** Roles a los que la matriz de `architecture.md` §Roles concede el módulo. */
  roles: readonly RolUsuario[];
};

/**
 * Los CUATRO módulos del producto (ADR-050). Eran siete en el prototipo y se
 * quedaron en cuatro porque tres no eran módulos:
 *
 *   · `Inicio` era la agenda del día descrita otra vez.
 *   · `Clínica` era una bandeja que el maestro ya pone en el panel lateral de
 *     Inicio.
 *   · `Usuarios` baja a Ajustes › Centros y usuarios, donde su permiso ya
 *     coincidía.
 *
 * Los dos primeros son ahora bloques DENTRO de Agenda. Que desaparezcan de
 * aquí no borra ninguna ruta: esto es navegación, no enrutado.
 *
 * `disponible` es falso salvo en lo que existe de verdad. Un módulo apagado se
 * pinta sin enlace y marcado «próximamente», que es enseñar el mapa del producto
 * sin prometer una pantalla que llevaría a un 404.
 *
 * `roles` sale de la matriz, no de una intuición. Hoy solo discrimina en uno, y
 * es el que la matriz recorta sin ambigüedad: **«Usuarios y ajustes de empresa:
 * Total / Sin acceso / Sin acceso»**. Ajustes es del administrador y de nadie
 * más. Los otros tres módulos los ven los tres roles —con contenido distinto
 * dentro, que es cosa de cada pantalla, no de la navegación—.
 */
export const MODULOS: Modulo[] = [
  {
    etiqueta: t('modulos.agenda'),
    href: '/agenda',
    icono: CalendarDays,
    disponible: false,
    roles: TODOS_LOS_ROLES,
  },
  {
    etiqueta: t('modulos.pacientes'),
    href: '/pacientes',
    icono: Users,
    disponible: true,
    roles: TODOS_LOS_ROLES,
  },
  {
    etiqueta: t('modulos.facturacion'),
    href: '/facturacion',
    icono: WalletCards,
    disponible: false,
    roles: TODOS_LOS_ROLES,
  },
  {
    etiqueta: t('modulos.ajustes'),
    href: '/ajustes',
    icono: Settings2,
    disponible: false,
    roles: ['administrador'],
  },
];

/**
 * Los módulos que la matriz concede a `rol`. Función pura y probada: el filtro por
 * rol es una regla del dominio, no una condición suelta dentro de un JSX donde
 * nadie vuelve a mirarla.
 *
 * `rol` nulo —sesión sin perfil, o perfil no activo— devuelve **lista vacía**, no
 * la lista entera. Fallo cerrado: si no se sabe quién mira, no se le enseña un
 * mapa del producto.
 */
export function modulosDe(rol: RolUsuario | null): Modulo[] {
  if (rol === null) return [];
  return MODULOS.filter((modulo) => modulo.roles.includes(rol));
}

const NOMBRES_DE_ROL: Record<string, string> = {
  administrador: t('roles.administrador'),
  profesional_sanitario: t('roles.profesionalSanitario'),
  tecnico_administrativo: t('roles.tecnicoAdministrativo'),
};

export function nombrarRol(rol: string) {
  return NOMBRES_DE_ROL[rol] ?? rol;
}

/** Iniciales para el avatar: «Ana Silva Ruiz» → «AS». */
export function iniciales(nombreCompleto: string) {
  return nombreCompleto
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');
}
