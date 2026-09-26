import { z } from 'zod';

import { esFechaDeCalendario } from '@/lib/fechas/calendario';

export type Vista = 'semana' | 'mes';

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
 * ausente. Ninguno llega a SQL; la fecha solo decide el rango que calcula el servidor.
 */
export function leerParametros(sp: Record<string, Valor>): ParametrosAgenda {
  const vista = unico(sp.vista);
  const fecha = unico(sp.fecha);
  const centro = unico(sp.centro);
  const profesional = unico(sp.profesional);

  return {
    vista: vista === 'mes' ? 'mes' : 'semana',
    fecha: fecha !== null && esFechaDeCalendario(fecha) ? fecha : null,
    centro: centro !== null && (centro === 'todos' || esUuid(centro)) ? centro : null,
    profesional: profesional !== null && esUuid(profesional) ? profesional : null,
  };
}
