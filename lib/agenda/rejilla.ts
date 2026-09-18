// La rejilla de la semana, pura (T-030): dados unos intervalos y una semana,
// devuelve DÓNDE va cada uno — día, minuto de inicio, duración y columna —
// sin base de datos, sin pantalla y sin reloj propio. T-014 pinta contra
// esto; aquí solo hay aritmética.
//
// Decisiones fijadas (cada una admitía otra lectura; el porqué va aquí):
//
// 1. MINUTOS ABSOLUTOS, no de reloj de pared. `inicioMinutos` es la distancia
//    real desde las 00:00 locales del día. En el domingo del salto de marzo
//    (23 h reales) una cita de las 10:00 cae en el minuto 540, no 600: la hora
//    02:00-02:59 no existió y la rejilla tiene una franja menos. El domingo de
//    octubre dura 25 h y tiene una de más. Con minutos absolutos ambos días
//    salen solos, sin lógica especial, y ninguna cita queda desplazada una
//    celda de su etiqueta.
//
// 2. LA CITA QUE CRUZA LA MEDIANOCHE SE PARTE EN DOS TRAMOS, uno por día, que
//    comparten `indice`. La alternativa (recortarla al día de inicio) pierde
//    horas reales de una guardia sin avisar: la pantalla pintaría una noche de
//    22:00 a 24:00 y la mañana desaparecería. Partida, cada tramo se coloca y
//    se agrupa en su propio día y no se pierde nada. Lo que sigue sin valer —
//    y se descarta, documentado aquí — es el intervalo degenerado (fin antes
//    que inicio) y el que cae fuera de la semana: el llamante consulta por
//    `limitesDeSemana`, así que no llegan.
//
// 3. COLUMNA ÚNICA POR GRUPO. Un grupo es la clausura transitiva del solape
//    (A pisa a B y B pisa a C → las tres juntas aunque A y C no se toquen).
//    Dentro del grupo cada cita recibe su propia columna y `columnasEnGrupo`
//    es el tamaño del grupo. No se reutilizan columnas aunque dos citas del
//    grupo quepan: la regla «una cita, una columna» es estable, trivial de
//    explicar y suficiente para los solapes reales de una consulta.
//
// 4. ORDEN ESTABLE: inicio, luego fin, luego índice de entrada. El índice es
//    el último desempate porque dos citas idénticas en hora siguen siendo dos
//    filas distintas; como la celda conserva `indice`, permutar la entrada
//    produce exactamente la misma salida.

import { duracionEnMinutos, seSolapan, type Intervalo } from '../fechas/intervalos';
import { diasDeSemana, limitesDeSemana } from '../fechas/semana';

export interface CeldaRejilla {
  /** Posición del intervalo en el array de entrada (su identidad aquí). */
  indice: number;
  /** Día de la semana, 0-6, lunes primero. */
  dia: number;
  /** Minutos absolutos desde las 00:00 locales del día (ver decisión 1). */
  inicioMinutos: number;
  /** Minutos absolutos del tramo en ESTE día. */
  duracionMinutos: number;
  /** Columna dentro del grupo, 0..columnasEnGrupo-1, única en su grupo. */
  columna: number;
  /** Citas del grupo de solapes encadenados al que pertenece (ver decisión 3). */
  columnasEnGrupo: number;
}

/** Pedazo de un intervalo dentro de un solo día. */
interface Tramo {
  indice: number;
  dia: number;
  inicio: Date;
  fin: Date;
}

/**
 * Coloca cada intervalo en la rejilla de la semana de `fecha` en `zona`.
 * Devuelve una celda por tramo (un intervalo que cruza la medianoche da dos),
 * ordenadas por inicio, fin e índice de entrada.
 */
export function colocarEnRejilla(
  intervalos: Intervalo[],
  fecha: Date,
  zona: string,
): CeldaRejilla[] {
  const dias = diasDeSemana(fecha, zona);
  const { fin: finDeSemana } = limitesDeSemana(fecha, zona);
  const limitesDeDia = [...dias, finDeSemana];

  // Decisión 2: partir cada intervalo en tramos de un día. La intersección
  // vacía (fuera de la semana, o fin antes que inicio) no produce tramo.
  const tramos: Tramo[] = [];
  intervalos.forEach((intervalo, indice) => {
    for (let dia = 0; dia < 7; dia++) {
      const inicio = intervalo.inicio > limitesDeDia[dia] ? intervalo.inicio : limitesDeDia[dia];
      const fin = intervalo.fin < limitesDeDia[dia + 1] ? intervalo.fin : limitesDeDia[dia + 1];
      if (inicio < fin) {
        tramos.push({ indice, dia, inicio, fin });
      }
    }
  });

  // Decisión 4: orden explícito y total. Sin él, la salida dependería del
  // orden en que llegó el array.
  tramos.sort(
    (a, b) =>
      a.inicio.getTime() - b.inicio.getTime() ||
      a.fin.getTime() - b.fin.getTime() ||
      a.indice - b.indice,
  );

  // Decisión 3: barrido. Como los tramos están partidos por día y ordenados
  // por inicio, el siguiente pertenece al grupo si solapa con la fusión de lo
  // acumulado; si no, el grupo se cierra y empieza otro.
  const celdas: CeldaRejilla[] = [];
  let inicioDelGrupo = 0;
  while (inicioDelGrupo < tramos.length) {
    const fusion: Intervalo = {
      inicio: tramos[inicioDelGrupo].inicio,
      fin: tramos[inicioDelGrupo].fin,
    };
    let finDelGrupo = inicioDelGrupo;
    while (
      finDelGrupo + 1 < tramos.length &&
      seSolapan(tramos[finDelGrupo + 1], fusion)
    ) {
      finDelGrupo++;
      if (tramos[finDelGrupo].fin > fusion.fin) {
        fusion.fin = tramos[finDelGrupo].fin;
      }
    }

    const columnasEnGrupo = finDelGrupo - inicioDelGrupo + 1;
    for (let i = inicioDelGrupo; i <= finDelGrupo; i++) {
      const tramo = tramos[i];
      celdas.push({
        indice: tramo.indice,
        dia: tramo.dia,
        inicioMinutos: duracionEnMinutos(limitesDeDia[tramo.dia], tramo.inicio),
        duracionMinutos: duracionEnMinutos(tramo.inicio, tramo.fin),
        columna: i - inicioDelGrupo,
        columnasEnGrupo,
      });
    }
    inicioDelGrupo = finDelGrupo + 1;
  }

  return celdas;
}
