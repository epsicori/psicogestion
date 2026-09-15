// Funciones puras de la ficha: nada de Supabase, nada de React. Se prueban solas y por eso
// viven aparte de la pantalla.
import { differenceInMonths, differenceInYears } from 'date-fns';

import type { Database } from '@/lib/supabase/tipos-bd';

export type NivelDeRiesgo = Database['public']['Enums']['nivel_riesgo'];
export type ModalidadRelacional = Database['public']['Enums']['modalidad_relacional'];

/**
 * Cuánto vale una valoración de riesgo antes de que enseñarla sin más induzca a error.
 *
 * **Seis meses es provisional y lo decide una persona con formación clínica, no un
 * agente.** Está aquí en una constante con nombre, y no repartido por la pantalla, para que
 * cambiarlo sea una línea. Mientras tanto la interfaz no oculta la valoración vieja ni la
 * llama caducada: sigue enseñando el nivel y la fecha, y añade que conviene revisarlo.
 */
export const MESES_VALORACION_VIGENTE = 6;

/** Años cumplidos, o `null` si no consta la fecha de nacimiento. */
export function edadEnAnios(fechaNacimiento: string | null, ahora: Date = new Date()): number | null {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;

  const anios = differenceInYears(ahora, nacimiento);
  // Una fecha de nacimiento en el futuro es un dato mal metido, no una edad negativa.
  return anios < 0 ? null : anios;
}

/** Si la valoración lleva más de `MESES_VALORACION_VIGENTE` sin repetirse. */
export function valoracionEsAntigua(valoradoEn: string, ahora: Date = new Date()): boolean {
  const fecha = new Date(valoradoEn);
  if (Number.isNaN(fecha.getTime())) return false;
  return differenceInMonths(ahora, fecha) >= MESES_VALORACION_VIGENTE;
}

/**
 * Minutos que faltan para `iso`, redondeados hacia arriba; negativo si ya pasó.
 *
 * El candado de la ficha y el de `/candado` cuentan igual a propósito: si la pantalla de la
 * ficha redondease hacia abajo, diría «0 min» treinta segundos antes de cerrarse de verdad.
 */
export function minutosRestantes(iso: string, ahora: Date = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - ahora.getTime()) / 60000);
}

export type DiagnosticoDeVista = {
  id: string;
  codigo: string;
  descripcion: string | null;
  principal: boolean;
  retiradoEn: string | null;
};

export type EpisodioDeVista = {
  id: string;
  motivo: string | null;
  modalidad: ModalidadRelacional;
  abiertoEn: string;
  cerradoEn: string | null;
  diagnosticos: DiagnosticoDeVista[];
};

type FilaEpisodio = {
  id: string;
  motivo_consulta: string | null;
  modalidad_relacional: ModalidadRelacional;
  abierto_en: string;
  cerrado_en: string | null;
};

type FilaDiagnostico = {
  id: string;
  episodio_id: string;
  cie10es_codigo: string;
  cie10es_descripcion: string | null;
  principal: boolean;
  retirado_en: string | null;
};

/**
 * Cuelga cada diagnóstico de su episodio. Se hace aquí y no con un `select` anidado porque
 * `diagnosticos` tiene política propia: un diagnóstico que RLS no deja ver **no llega**, y
 * entonces su episodio se pinta sin él en vez de desaparecer entero.
 *
 * Lo que llega sin episodio conocido se descarta en silencio: sería un diagnóstico huérfano
 * de un episodio que no podemos leer, y enseñarlo suelto diría que existe.
 */
export function agruparPorEpisodio(
  episodios: FilaEpisodio[],
  diagnosticos: FilaDiagnostico[],
): EpisodioDeVista[] {
  const porEpisodio = new Map<string, DiagnosticoDeVista[]>();

  for (const d of diagnosticos) {
    const lista = porEpisodio.get(d.episodio_id);
    const vista: DiagnosticoDeVista = {
      id: d.id,
      codigo: d.cie10es_codigo,
      descripcion: d.cie10es_descripcion,
      principal: d.principal,
      retiradoEn: d.retirado_en,
    };
    if (lista) lista.push(vista);
    else porEpisodio.set(d.episodio_id, [vista]);
  }

  return episodios.map((e) => ({
    id: e.id,
    motivo: e.motivo_consulta,
    modalidad: e.modalidad_relacional,
    abiertoEn: e.abierto_en,
    cerradoEn: e.cerrado_en,
    // El principal primero, y dentro de cada grupo el vigente antes que el retirado: es el
    // orden en que se lee un historial, no el que devuelva la base.
    diagnosticos: (porEpisodio.get(e.id) ?? []).sort(
      (a, b) =>
        Number(b.principal) - Number(a.principal) ||
        Number(a.retiradoEn !== null) - Number(b.retiradoEn !== null),
    ),
  }));
}
