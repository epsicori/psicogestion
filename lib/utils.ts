import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Une clases de Tailwind resolviendo los conflictos a favor de la última. */
export function cn(...clases: ClassValue[]) {
  return twMerge(clsx(clases));
}
