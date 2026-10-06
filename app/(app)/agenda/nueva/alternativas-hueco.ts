import type { HuecoVista } from './vista-alta';

type Candidato = Pick<HuecoVista, 'clave' | 'fecha' | 'diaIndice' | 'minutoPared' | 'estado'>;

/**
 * Hasta `maximo` huecos libres de la semana pintada que no dejan hueco raro, para el aviso (T-043).
 * Orden fijo: el mismo día primero; luego por distancia en días (a igual distancia, el anterior);
 * dentro del día, por distancia en minutos a la hora elegida (a igual distancia, el anterior).
 * Si el elegido no está entre `huecos` (su semana aún no se ha pintado), devuelve [].
 *
 * No es `sugerirHuecos` (ADR-049c): aquello recomienda por reglas de la agenda; esto solo ofrece
 * salidas cercanas a lo ya elegido.
 */
export function alternativasSinHueco(
  huecos: readonly Candidato[],
  huecosRaros: Readonly<Record<string, number>>,
  claveElegida: string,
  maximo = 3,
): string[] {
  const elegido = huecos.find((h) => h.clave === claveElegida);
  if (!elegido) return [];
  return huecos
    .filter((h) => h.estado === 'libre' && h.clave !== claveElegida && !Object.hasOwn(huecosRaros, h.clave))
    .sort(
      (a, b) =>
        Number(a.fecha !== elegido.fecha) - Number(b.fecha !== elegido.fecha) ||
        Math.abs(a.diaIndice - elegido.diaIndice) - Math.abs(b.diaIndice - elegido.diaIndice) ||
        a.diaIndice - b.diaIndice ||
        Math.abs(a.minutoPared - elegido.minutoPared) - Math.abs(b.minutoPared - elegido.minutoPared) ||
        a.minutoPared - b.minutoPared,
    )
    .slice(0, maximo)
    .map((h) => h.clave);
}
