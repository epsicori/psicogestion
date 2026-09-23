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
//    comparten `id`. La alternativa (recortarla al día de inicio) pierde
//    horas reales de una guardia sin avisar: la pantalla pintaría una noche de
//    22:00 a 24:00 y la mañana desaparecería. Partida, cada tramo se coloca y
//    se agrupa en su propio día y no se pierde nada. Lo que sigue sin valer —
//    y se descarta, documentado aquí — es el intervalo degenerado (fin antes
//    que inicio), el que cae fuera de la semana (el llamante consulta por
//    `limitesDeSemana`, así que no llegan) y el de fecha inválida
//    (`Number.isNaN` en `inicio` o `fin`, p. ej. un `new Date(undefined)` de
//    una fila con la columna sin seleccionar): toda comparación con `NaN` da
//    `false`, así que sin esta guarda explícita el recorte de día elegiría
//    siempre el límite del día en vez del propio intervalo, y la cita inválida
//    se estiraría en silencio hasta ocupar la semana entera (H6).
//
// 3. COLUMNA ÚNICA POR GRUPO. Un grupo es la clausura transitiva del solape
//    (A pisa a B y B pisa a C → las tres juntas aunque A y C no se toquen).
//    Dentro del grupo cada cita recibe su propia columna y `columnasEnGrupo`
//    es el tamaño del grupo. No se reutilizan columnas aunque dos citas del
//    grupo quepan: la regla «una cita, una columna» es estable, trivial de
//    explicar y suficiente para los solapes reales de una consulta.
//
// 4. ORDEN ESTABLE POR CONTENIDO, no por posición: inicio, luego fin, luego
//    `id` de la cita. El desempate NO puede ser la posición en el array de
//    entrada (H5): dos citas a la misma hora reciben columnas distintas hoy,
//    pero si Postgres las devuelve en otro orden en el siguiente `select`,
//    cada una cambiaría de columna en pantalla sin que nada haya cambiado en
//    los datos. Por eso el llamante aporta un `id` estable (el de la cita) y
//    el desempate final es sobre ese valor: mismo conjunto de entrada, en
//    cualquier orden, misma cita en la misma columna.

import { duracionEnMinutos, seSolapan, type Intervalo } from '../fechas/intervalos';
import { diasDeSemana, limitesDeSemana } from '../fechas/semana';

/** Lo que entra a la rejilla: un intervalo más la identidad estable de su cita. */
export interface CitaParaRejilla extends Intervalo {
  /** Identidad de la cita (su id de base de datos). Ver decisión 4. */
  id: string;
}

export interface CeldaRejilla {
  /** Id de la cita de origen (el mismo para los dos tramos de una que cruza la medianoche). */
  id: string;
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

/** Pedazo de una cita dentro de un solo día. */
interface Tramo {
  id: string;
  dia: number;
  inicio: Date;
  fin: Date;
}

/** `true` si `fecha` no es un instante válido (ver decisión 2, H6). */
function esFechaInvalida(fecha: Date): boolean {
  return Number.isNaN(fecha.getTime());
}

/**
 * Compara dos ids para el desempate final del orden (decisión 4). Comparación
 * de cadena simple y explícita, sin locale: solo hace falta que sea total y
 * estable, no que ordene alfabéticamente «bien» ningún idioma en particular.
 */
function compararIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Coloca cada cita en la rejilla de la semana de `fecha` en `zona`.
 * Devuelve una celda por tramo (una cita que cruza la medianoche da dos),
 * ordenadas por inicio, fin e id de la cita.
 */
export function colocarEnRejilla(
  citas: CitaParaRejilla[],
  fecha: Date,
  zona: string,
): CeldaRejilla[] {
  const dias = diasDeSemana(fecha, zona);
  const { fin: finDeSemana } = limitesDeSemana(fecha, zona);
  const limitesDeDia = [...dias, finDeSemana];

  // Decisión 2: partir cada cita en tramos de un día. La intersección vacía
  // (fuera de la semana, fin antes que inicio) no produce tramo; una fecha
  // inválida se descarta entera, antes de intentar recortarla (H6).
  const tramos: Tramo[] = [];
  citas.forEach((cita) => {
    if (esFechaInvalida(cita.inicio) || esFechaInvalida(cita.fin)) {
      return;
    }
    for (let dia = 0; dia < 7; dia++) {
      const inicio = cita.inicio > limitesDeDia[dia] ? cita.inicio : limitesDeDia[dia];
      const fin = cita.fin < limitesDeDia[dia + 1] ? cita.fin : limitesDeDia[dia + 1];
      if (inicio < fin) {
        tramos.push({ id: cita.id, dia, inicio, fin });
      }
    }
  });

  // Decisión 4: orden explícito y total, por contenido y no por posición.
  tramos.sort(
    (a, b) =>
      a.inicio.getTime() - b.inicio.getTime() ||
      a.fin.getTime() - b.fin.getTime() ||
      compararIds(a.id, b.id),
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
        id: tramo.id,
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
