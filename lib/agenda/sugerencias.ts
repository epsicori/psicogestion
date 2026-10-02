// Sugerencias de hueco para el alta de cita (T-028, ADR-049c). Pura: sin zona,
// sin reloj y sin base de datos; todas las fechas son `AAAA-MM-DD` de la zona
// del centro y la aritmética es de calendario (`lib/fechas/calendario`).
//
// Esta función no recibe el tipo de terapia ni la modalidad, así que ningún
// motivo puede nombrarlos (D8). Tampoco produce cifras: `n` y `dias` se
// escriben con palabras en la interfaz.
import { diasEntre, sumarDias } from '@/lib/fechas/calendario';

export type DiaSemana = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type CitaPasada = {
  fecha: string; // AAAA-MM-DD local
  diaSemana: DiaSemana;
  horaLocal: string; // HH:MM
};

export type BloqueLibre = {
  fecha: string;
  horaLocal: string;
  diaSemana: DiaSemana;
};

export type MotivoSugerencia =
  | { tipo: 'comoLasUltimas'; n: number }
  | { tipo: 'diaHabitual'; diaSemana: number; hora: string }
  | { tipo: 'cadaIntervalo'; dias: number }
  | { tipo: 'primerHueco' };

export type Sugerencia = { fecha: string; horaLocal: string; motivo: MotivoSugerencia };

export type ResultadoSugerencias = {
  modo: 'habitual' | 'enFrio';
  sugerencias: Sugerencia[]; // ≤ 3
};

const MAXIMO = 3;
const MINIMO_PASADAS = 3;
const FRECUENCIA_MINIMA = 2;

/**
 * Moda con frecuencia ≥ 2; en empate gana el menor. `undefined` si ningún
 * valor se repite.
 */
function moda<T extends number | string>(valores: T[]): T | undefined {
  const cuenta = new Map<T, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let mejor: T | undefined;
  let frecuencia = 0;
  for (const [v, n] of cuenta) {
    if (n < FRECUENCIA_MINIMA) continue;
    if (n > frecuencia || (n === frecuencia && mejor !== undefined && v < mejor)) {
      mejor = v;
      frecuencia = n;
    }
  }
  return mejor;
}

const clave = (fecha: string, horaLocal: string) => `${fecha}T${horaLocal}`;

export function sugerirHuecos(entrada: {
  pasadas: CitaPasada[]; // las ≤ 6 últimas, sin canceladas, orden ascendente
  libres: BloqueLibre[]; // orden ascendente, en la zona del centro
  hoy: string; // AAAA-MM-DD en la zona del centro
  excluir?: string[]; // `${fecha}T${hora}`
}): ResultadoSugerencias {
  const { pasadas, hoy } = entrada;
  const excluidos = new Set(entrada.excluir ?? []);
  const candidatos = entrada.libres.filter(
    (b) => b.fecha > hoy && !excluidos.has(clave(b.fecha, b.horaLocal)),
  );

  const usados = new Set<string>();
  const sugerencias: Sugerencia[] = [];
  const añadir = (b: BloqueLibre, motivo: MotivoSugerencia) => {
    usados.add(clave(b.fecha, b.horaLocal));
    sugerencias.push({ fecha: b.fecha, horaLocal: b.horaLocal, motivo });
  };
  const rellenar = () => {
    for (const b of candidatos) {
      if (sugerencias.length >= MAXIMO) break;
      if (usados.has(clave(b.fecha, b.horaLocal))) continue;
      añadir(b, { tipo: 'primerHueco' });
    }
  };

  // 1. Modas.
  const intervalos: number[] = [];
  for (let i = 1; i < pasadas.length; i++) {
    intervalos.push(diasEntre(pasadas[i - 1].fecha, pasadas[i].fecha));
  }
  const intervaloModa = moda(intervalos);
  const diaHabitual = moda(pasadas.map((p) => p.diaSemana));
  const horaHabitual =
    diaHabitual === undefined
      ? undefined
      : moda(pasadas.filter((p) => p.diaSemana === diaHabitual).map((p) => p.horaLocal));

  // 2. Habitual o en frío.
  const habitual =
    pasadas.length >= MINIMO_PASADAS &&
    intervaloModa !== undefined &&
    intervaloModa > 0 &&
    diaHabitual !== undefined &&
    horaHabitual !== undefined;

  if (!habitual) {
    rellenar();
    return { modo: 'enFrio', sugerencias };
  }

  // 3. Habitual. Objetivo: última fecha + intervalo, avanzado hasta ser > hoy.
  let objetivo = sumarDias(pasadas[pasadas.length - 1].fecha, intervaloModa);
  while (objetivo <= hoy) objetivo = sumarDias(objetivo, intervaloModa);

  const coincidenTodas = pasadas.every(
    (p) => p.diaSemana === diaHabitual && p.horaLocal === horaHabitual,
  );

  // (a) el bloque del objetivo a la hora habitual.
  const enObjetivo = candidatos.find((b) => b.fecha === objetivo && b.horaLocal === horaHabitual);
  if (enObjetivo) {
    añadir(
      enObjetivo,
      coincidenTodas
        ? { tipo: 'comoLasUltimas', n: pasadas.length }
        : { tipo: 'cadaIntervalo', dias: intervaloModa },
    );
  }

  // (b) el siguiente bloque libre en el día habitual a la hora habitual.
  const enDiaHabitual = candidatos.find(
    (b) =>
      b.diaSemana === diaHabitual &&
      b.horaLocal === horaHabitual &&
      !usados.has(clave(b.fecha, b.horaLocal)),
  );
  if (enDiaHabitual) {
    añadir(enDiaHabitual, { tipo: 'diaHabitual', diaSemana: diaHabitual, hora: horaHabitual });
  }

  // (c) hasta tres, con el primer hueco libre no usado.
  rellenar();
  return { modo: 'habitual', sugerencias };
}
