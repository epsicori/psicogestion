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
  { etiqueta: 'Inicio', href: '/inicio', icono: LayoutDashboard, disponible: false },
  { etiqueta: 'Pacientes', href: '/pacientes', icono: Users, disponible: true },
  { etiqueta: 'Agenda', href: '/agenda', icono: CalendarDays, disponible: false },
  { etiqueta: 'Clínica', href: '/clinica', icono: FileText, disponible: false },
  { etiqueta: 'Facturación', href: '/facturacion', icono: WalletCards, disponible: false },
  { etiqueta: 'Usuarios', href: '/usuarios', icono: Stethoscope, disponible: false },
  { etiqueta: 'Ajustes', href: '/ajustes', icono: Settings2, disponible: false },
];

const NOMBRES_DE_ROL: Record<string, string> = {
  administrador: 'Administrador',
  profesional_sanitario: 'Profesional sanitario',
  tecnico_administrativo: 'Técnico administrativo',
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
