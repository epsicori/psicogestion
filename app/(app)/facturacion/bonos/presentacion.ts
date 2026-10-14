import { t, tCon } from '@/lib/i18n';

import type { EstadoBono, LecturaBono } from './estado';

/**
 * Filtro, orden y paginación en memoria del listado de bonos (T-027 §1.5, D5). El estado depende de dos
 * columnas de la vista y de «hoy»: PostgREST no compara dos columnas y añadir un `saldo` a la vista sería
 * inventar una columna. Puro y sin E/S.
 */

/** Filas por página (el mismo tamaño que el pendiente de T-023). */
export const TAMANO_PAGINA_BONOS = 50;

export type FilaDeBono = {
  bonoId: string;
  pacienteId: string;
  nombre: string;
  apellidos: string;
  profesionalId: string | null;
  creadoEn: string;
  lectura: LecturaBono;
};

export type FiltroDeBonos = {
  estado: EstadoBono | null;
  profesional: string | null;
  paciente: string | null;
};

/** Estrecha, nunca amplía: lo que no pasa el filtro se descarta de una lista que ya venía recortada por RLS. */
export function filtrarBonos<T extends FilaDeBono>(bonos: T[], filtro: FiltroDeBonos): T[] {
  return bonos.filter(
    (b) =>
      (filtro.estado === null || b.lectura.estado === filtro.estado) &&
      (filtro.profesional === null || b.profesionalId === filtro.profesional) &&
      (filtro.paciente === null || b.pacienteId === filtro.paciente),
  );
}

/** Apellidos, nombre y, a igual paciente, el bono más reciente primero. */
export function ordenarBonos<T extends FilaDeBono>(bonos: T[]): T[] {
  const colador = new Intl.Collator('es', { sensitivity: 'base' });
  return [...bonos].sort(
    (a, b) =>
      colador.compare(a.apellidos, b.apellidos) ||
      colador.compare(a.nombre, b.nombre) ||
      (a.pacienteId < b.pacienteId ? -1 : a.pacienteId > b.pacienteId ? 1 : 0) ||
      (a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : 0) ||
      (a.bonoId < b.bonoId ? -1 : 1),
  );
}

/** Tres tonos y ninguno rojo: ni «agotado» ni «caducado» son un error. */
export function pildoraDeEstado(estado: EstadoBono): { tono: 'success' | 'info' | 'warning'; texto: string } {
  switch (estado) {
    case 'vigente':
      return { tono: 'success', texto: t('bonos.estado.vigente') };
    case 'agotado':
      return { tono: 'info', texto: t('bonos.estado.agotado') };
    case 'caducado':
      return { tono: 'warning', texto: t('bonos.estado.caducado') };
  }
}

/** «Quedan 3 sesiones» / «Queda 1 sesión» / «No quedan sesiones». */
export function textoQuedan(saldo: number): string {
  if (saldo <= 0) return t('bonos.quedan.ninguna');
  if (saldo === 1) return t('bonos.quedan.una');
  return tCon('bonos.quedan.varias', { n: saldo });
}

/** La línea de sesiones hechas de más, o `null` si no hay. */
export function textoExcedidas(excedidas: number): string | null {
  if (excedidas <= 0) return null;
  return excedidas === 1 ? t('bonos.excedidas.una') : tCon('bonos.excedidas.varias', { n: excedidas });
}

/** Una página que pasa de la última cae en la última. */
export function paginarBonos<T>(bonos: T[], paginaPedida: number) {
  const total = bonos.length;
  const ultima = Math.max(1, Math.ceil(total / TAMANO_PAGINA_BONOS));
  const pagina = Math.min(Math.max(1, paginaPedida), ultima);
  const desde = (pagina - 1) * TAMANO_PAGINA_BONOS;
  return { pagina, ultima, total, filas: bonos.slice(desde, desde + TAMANO_PAGINA_BONOS) };
}
