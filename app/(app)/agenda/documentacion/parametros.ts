import { z } from 'zod';

import { Constants } from '@/lib/supabase/tipos-bd';

import type { Filtros } from '../pendientes';

/**
 * Los parámetros de la página de documentación pendiente (T-048). Puro: lo importan el servidor y
 * el buscador (cliente). Por eso no importa `../pendientes` como valor, que arrastraría `bloques.ts`
 * (date-fns, zonas) al paquete del navegador: la lista de tipos sale de `Constants`, la misma
 * fuente que `ORDEN_TIPOS`.
 */

export const ID_TITULO = 'documentacion-titulo';

const esquemaTipo = z.enum(Constants.public.Enums.tipo_alerta_documentacion);
const esquemaNivel = z.enum(['1', '2', '3']).transform((n) => Number(n) as 1 | 2 | 3);
const esquemaPagina = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1));
const esquemaPaciente = z.uuid();

export const esquemaTermino = z.string().trim().min(2).max(100);

type Crudos = Record<string, string | string[] | undefined>;

/** Un valor repetido (array), un fichero o algo que no valida es ausente: nunca un error. */
function leer<T>(esquema: z.ZodType<T>, valor: unknown): T | null {
  if (typeof valor !== 'string') return null;
  const r = esquema.safeParse(valor);
  return r.success ? r.data : null;
}

export function leerParametrosDocumentacion(crudos: Crudos): Filtros & { pagina: number } {
  return {
    pagina: leer(esquemaPagina, crudos.pagina) ?? 1,
    tipo: leer(esquemaTipo, crudos.tipo),
    nivel: leer(esquemaNivel, crudos.nivel),
    paciente: leer(esquemaPaciente, crudos.paciente),
  };
}

/** Solo `tipo` y `nivel`: el resto del formulario no existe para quien lo llama. */
export function leerFiltrosDeFormulario(datos: FormData): Pick<Filtros, 'tipo' | 'nivel'> {
  return {
    tipo: leer(esquemaTipo, datos.get('tipo')),
    nivel: leer(esquemaNivel, datos.get('nivel')),
  };
}
