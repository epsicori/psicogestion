import {
  CalendarDays,
  FileText,
  LayoutDashboard,
  Settings2,
  Stethoscope,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

import { t } from '@/lib/i18n';

export type Modulo = {
  etiqueta: string;
  href: string;
  icono: LucideIcon;
  /** Falso mientras el ticket que construye el módulo no esté integrado. */
  disponible: boolean;
};

/**
 * Los siete módulos del prototipo. Los que aún no tienen ticket integrado se
 * pintan apagados y sin enlace: la navegación enseña el mapa completo del
 * producto sin prometer pantallas que llevarían a un 404.
 */
export const MODULOS: Modulo[] = [
  { etiqueta: t('modulos.inicio'), href: '/inicio', icono: LayoutDashboard, disponible: false },
  { etiqueta: t('modulos.pacientes'), href: '/pacientes', icono: Users, disponible: true },
  { etiqueta: t('modulos.agenda'), href: '/agenda', icono: CalendarDays, disponible: false },
  { etiqueta: t('modulos.clinica'), href: '/clinica', icono: FileText, disponible: false },
  { etiqueta: t('modulos.facturacion'), href: '/facturacion', icono: WalletCards, disponible: false },
  { etiqueta: t('modulos.usuarios'), href: '/usuarios', icono: Stethoscope, disponible: false },
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
