import type { DiaAlta, HuecoVista } from './vista-alta';

/**
 * El modo selección de la semana (T-028 B, ronda 2 · H5): la misma rejilla y la misma lista por
 * día de la agenda, pero en lugar de citas pintan los huecos del alta. Solo cadenas y números:
 * llegan ya escritos del servidor (ADR-034).
 */
export type SeleccionHuecos = {
  huecos: HuecoVista[];
  /** La clave `AAAA-MM-DDTHH:MM` del hueco elegido, o null. */
  elegido: string | null;
  /** Se elige un hueco libre: su clave y lo que se enseña de él en el resumen. */
  alElegir: (clave: string, etiqueta: string) => void;
};

/** Dónde cae un hueco dentro de su día cuando dos se pisan: carril y carriles del grupo que se pisa. */
export type Carril = { carril: number; carriles: number };

/**
 * Reparte los huecos de cada día en carriles para que ninguno tape a otro: un hueco de 90 minutos
 * cada 60 se solapa con el siguiente, y dos botones uno encima del otro no se pueden pulsar.
 * Los que no se pisan con nadie ocupan el ancho entero.
 */
export function carrilesDeHuecos(huecos: HuecoVista[]): Map<string, Carril> {
  const resultado = new Map<string, Carril>();
  const porDia = new Map<number, HuecoVista[]>();
  for (const h of huecos) porDia.set(h.diaIndice, [...(porDia.get(h.diaIndice) ?? []), h]);

  for (const delDia of porDia.values()) {
    const ordenados = [...delDia].sort((a, b) => a.minutoPared - b.minutoPared || a.clave.localeCompare(b.clave));
    let grupo: { hueco: HuecoVista; carril: number }[] = [];
    let finGrupo = -Infinity;
    const cerrar = () => {
      const carriles = grupo.reduce((max, g) => Math.max(max, g.carril + 1), 1);
      for (const g of grupo) resultado.set(g.hueco.clave, { carril: g.carril, carriles });
      grupo = [];
    };
    const finDeCarril: number[] = [];
    for (const hueco of ordenados) {
      if (hueco.minutoPared >= finGrupo) {
        cerrar();
        finDeCarril.length = 0;
      }
      let carril = finDeCarril.findIndex((fin) => fin <= hueco.minutoPared);
      if (carril === -1) carril = finDeCarril.length;
      finDeCarril[carril] = hueco.minutoPared + hueco.duracionMinutos;
      grupo.push({ hueco, carril });
      finGrupo = Math.max(finGrupo, hueco.minutoPared + hueco.duracionMinutos);
    }
    cerrar();
  }
  return resultado;
}

/**
 * El día con que se abre el calendario: el del hueco ya elegido si está en esta semana; si no, el
 * primero con un hueco libre; si no, hoy; si no, el primero.
 */
export function diaPorDefecto(dias: DiaAlta[], huecos: HuecoVista[], elegido: string | null = null): number {
  const delElegido = elegido === null ? undefined : huecos.find((h) => h.clave === elegido);
  if (delElegido) return delElegido.diaIndice;
  const libres = huecos.filter((h) => h.estado === 'libre').map((h) => h.diaIndice);
  if (libres.length > 0) return Math.min(...libres);
  const hoy = dias.findIndex((d) => d.esHoy);
  return hoy >= 0 ? hoy : 0;
}
