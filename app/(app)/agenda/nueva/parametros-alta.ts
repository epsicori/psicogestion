import { z } from 'zod';

import { esFechaDeCalendario } from '@/lib/fechas/calendario';

export type ParametrosAlta = {
  /** Un uuid de paciente, o null. Nunca un nombre en la URL (CLAUDE.md). */
  paciente: string | null;
  /** El hueco con que se abre, en hora local del centro, o null. */
  inicio: { fecha: string; hora: string } | null;
  /** Un uuid de centro, o null: manda la cookie del armazón. */
  centro: string | null;
};

type Valor = string | string[] | undefined;

const esUuid = (valor: string) => z.uuid().safeParse(valor).success;
const INICIO = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

/** Un parámetro repetido llega como lista: no se elige uno por el usuario, se ignora. */
function unico(valor: Valor): string | null {
  return typeof valor === 'string' ? valor : null;
}

/**
 * Los parámetros de `/agenda/nueva` (T-028 B). Nada se lanza: lo que no vale se trata como
 * ausente. Ninguno llega a SQL; el paciente se vuelve a leer con la RLS de quien mira.
 */
export function leerParametrosAlta(sp: Record<string, Valor>): ParametrosAlta {
  const paciente = unico(sp.paciente);
  const centro = unico(sp.centro);
  const inicio = unico(sp.inicio);
  const partes = inicio === null ? null : INICIO.exec(inicio);

  return {
    paciente: paciente !== null && esUuid(paciente) ? paciente : null,
    centro: centro !== null && esUuid(centro) ? centro : null,
    inicio: partes && esFechaDeCalendario(partes[1]) ? { fecha: partes[1], hora: `${partes[2]}:${partes[3]}` } : null,
  };
}
