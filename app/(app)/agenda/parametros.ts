import { z } from 'zod';

import { esFechaDeCalendario } from '@/lib/fechas/calendario';

export type Vista = 'semana' | 'mes' | 'anio';

/** Las vistas que se construyen con filas de citas: el año solo cuenta. */
export type VistaConCitas = Exclude<Vista, 'anio'>;

export type ParametrosAgenda = {
  vista: Vista;
  /** `AAAA-MM-DD` real, o null: «hoy», que resuelve el llamante en la zona. */
  fecha: string | null;
  /** Un uuid, `'todos'` o null (sin elegir: manda la cookie del armazón). */
  centro: string | null;
  profesional: string | null;
};

type Valor = string | string[] | undefined;

const esUuid = (valor: string) => z.uuid().safeParse(valor).success;

/** Un parámetro repetido llega como lista: no se elige uno por el usuario, se ignora. */
function unico(valor: Valor): string | null {
  return typeof valor === 'string' ? valor : null;
}

/**
 * Los parámetros de `/agenda` (T-014 §1.6). Nada se lanza: lo que no vale se trata como
 * ausente. Centro y profesional llegan a la base como parámetros con enlace de una RPC
 * (la del año, T-047) y la RLS manda; la fecha solo decide el rango que calcula el servidor.
 */
export function leerParametros(sp: Record<string, Valor>): ParametrosAgenda {
  const vista = unico(sp.vista);
  const fecha = unico(sp.fecha);
  const centro = unico(sp.centro);
  const profesional = unico(sp.profesional);

  return {
    vista: vista === 'mes' || vista === 'anio' ? vista : 'semana',
    fecha: fecha !== null && esFechaDeCalendario(fecha) ? fecha : null,
    centro: centro !== null && (centro === 'todos' || esUuid(centro)) ? centro : null,
    profesional: profesional !== null && esUuid(profesional) ? profesional : null,
  };
}

/** El enlace de `/agenda` con la misma forma en todas partes: vista, fecha, centro y profesional, si los hay. */
export function hrefAgenda(v: {
  vista: Vista;
  fecha: string | null;
  centro: string | null;
  profesional: string | null;
}): string {
  const p = new URLSearchParams();
  p.set('vista', v.vista);
  if (v.fecha) p.set('fecha', v.fecha);
  if (v.centro) p.set('centro', v.centro);
  if (v.profesional) p.set('profesional', v.profesional);
  return `/agenda?${p.toString()}`;
}
