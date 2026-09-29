import { format } from 'date-fns';
import { TZDate, tz } from '@date-fns/tz';

import type { RolUsuario } from '@/components/armazon/modulos';
import { diasDelMes } from '@/lib/agenda/mes';
import type { FilaAgenda } from '@/lib/citas/agenda';
import { diasEntre, sumarDias } from '@/lib/fechas/calendario';
import { limitesDeSemana } from '@/lib/fechas/semana';

import type { Vista } from './parametros';

/**
 * Lo que los bloques del servidor calculan antes de pintar (T-014 §1.6.1): rangos que se piden
 * a la base, selección y cuentas. Puro y sin E/S; el reloj lo pasa quien llama, que antes ha
 * hecho `await connection()`.
 */

export type Rango = { desde: Date; hasta: Date };

function aPartes(fecha: string): [number, number, number] {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return [anio, mes - 1, dia];
}

/** 00:00 del día en la zona, como `Date` corriente: el instante, sin la zona pegada. */
function medianoche(fecha: string, zona: string): Date {
  return new Date(new TZDate(...aPartes(fecha), 0, 0, 0, zona).getTime());
}

/** «Hoy» es el día de pared en la zona del centro, no el de UTC ni el del servidor. */
export function hoyEn(ahora: Date, zona: string): string {
  return format(ahora, 'yyyy-MM-dd', { in: tz(zona) });
}

/**
 * El rango que pide el calendario. La semana, `limitesDeSemana` de la fecha anclada a las
 * 12:00; el mes, de la medianoche del primero de los 42 días a la del día siguiente al último.
 */
export function rangoDeVista(vista: Vista, fecha: string, zona: string): Rango {
  if (vista === 'semana') {
    const { inicio, fin } = limitesDeSemana(new TZDate(...aPartes(fecha), 12, 0, 0, zona), zona);
    return { desde: new Date(inicio.getTime()), hasta: new Date(fin.getTime()) };
  }
  const dias = diasDelMes(fecha);
  return { desde: medianoche(dias[0].fecha, zona), hasta: medianoche(sumarDias(dias[dias.length - 1].fecha, 1), zona) };
}

/** De ahora al final de mañana en la zona. */
export function rangoDeProximas(ahora: Date, hoy: string, zona: string): Rango {
  return { desde: ahora, hasta: medianoche(sumarDias(hoy, 2), zona) };
}

/** Del día 1 del mes en curso, en la zona, hasta ahora. */
export function rangoDelMes(ahora: Date, hoy: string, zona: string): Rango {
  return { desde: medianoche(`${hoy.slice(0, 8)}01`, zona), hasta: ahora };
}

/**
 * El centro que filtra la agenda (§1.6.1): el de la URL si se ofrece; si no, el de la cookie
 * del armazón si se ofrece; si no, todos (`null`, que da la zona de la organización). `'todos'`
 * en la URL es una elección explícita y gana a la cookie.
 */
export function resolverCentro(parametro: string | null, cookie: string | undefined, ofrecidos: string[]): string | null {
  if (parametro === 'todos') return null;
  if (parametro !== null && ofrecidos.includes(parametro)) return parametro;
  if (cookie !== undefined && ofrecidos.includes(cookie)) return cookie;
  return null;
}

const ROLES: readonly RolUsuario[] = ['administrador', 'profesional_sanitario', 'tecnico_administrativo'];

/** Lista blanca: cualquier otro valor, o ninguno, es `null`. */
export function leerRol(valor: string | null | undefined): RolUsuario | null {
  return ROLES.find((rol) => rol === valor) ?? null;
}

/** El cuadro inferior, solo a quien lleva consulta o administra; al resto ni se le consulta. */
export function puedeVerCuadro(rol: RolUsuario | null): boolean {
  return rol === 'administrador' || rol === 'profesional_sanitario';
}

/** `null` es «todos los centros»: no se filtra. */
export function filtrarPorCentro(filas: FilaAgenda[], centro: string | null): FilaAgenda[] {
  return centro === null ? filas : filas.filter((f) => f.centroId === centro);
}

const MAXIMO_PROXIMAS = 5;

/** Las que aún no han empezado, programadas o confirmadas, por `(inicio, id)`: las 5 primeras. */
export function seleccionarProximas(filas: FilaAgenda[], ahora: Date): FilaAgenda[] {
  return filas
    .filter((f) => f.inicio.getTime() > ahora.getTime() && (f.estado === 'programada' || f.estado === 'confirmada'))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, MAXIMO_PROXIMAS);
}

export type MetricasDelMes = {
  /** Porcentaje entero, o null sin citas cerradas: se pinta «—». */
  asistencia: number | null;
  ausencia: number | null;
  /** Realizadas + no asistidas: el denominador. */
  cerradas: number;
};

/** Asistencia y ausencia sin aviso sobre las citas cerradas (realizadas + no asistidas). */
export function metricasDelMes(filas: FilaAgenda[]): MetricasDelMes {
  const realizadas = filas.filter((f) => f.estado === 'realizada').length;
  const noAsistidas = filas.filter((f) => f.estado === 'no_asistida').length;
  const cerradas = realizadas + noAsistidas;
  if (cerradas === 0) return { asistencia: null, ausencia: null, cerradas };
  return {
    asistencia: Math.round((realizadas / cerradas) * 100),
    ausencia: Math.round((noAsistidas / cerradas) * 100),
    cerradas,
  };
}

/** Días de calendario desde la fecha de referencia de la alerta hasta hoy en la zona. */
export function diasPendiente(fechaReferencia: string | null, hoy: string): number | null {
  return fechaReferencia === null ? null : diasEntre(fechaReferencia, hoy);
}

/**
 * Los tres tramos de `interfaz.md` (0, 24 y 72 h), en días de calendario (D10): el mismo día,
 * sin píldora; uno o dos días, «más de 24 h»; tres o más, «más de 72 h». No es el escalado real
 * (eso es T-015): solo cuánto lleva esperando.
 */
export function nivelDeAntiguedad(dias: number | null): 'mas24' | 'mas72' | null {
  if (dias === null || dias < 1) return null;
  return dias < 3 ? 'mas24' : 'mas72';
}
