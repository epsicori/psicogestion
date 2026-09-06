import { CalendarDays, Settings2, Users, WalletCards, type LucideIcon } from 'lucide-react';

import { t } from '@/lib/i18n';

export type Modulo = {
  etiqueta: string;
  href: string;
  icono: LucideIcon;
  /** Falso mientras el ticket que construye el módulo no esté integrado. */
  disponible: boolean;
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
 */
export const MODULOS: Modulo[] = [
  { etiqueta: t('modulos.agenda'), href: '/agenda', icono: CalendarDays, disponible: false },
  { etiqueta: t('modulos.pacientes'), href: '/pacientes', icono: Users, disponible: true },
  { etiqueta: t('modulos.facturacion'), href: '/facturacion', icono: WalletCards, disponible: false },
  { etiqueta: t('modulos.ajustes'), href: '/ajustes', icono: Settings2, disponible: false },
];

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
