import { describe, expect, it } from 'vitest';

import { colocarEnRejilla } from './rejilla';

// Semana de referencia: la del miércoles 15 de abril de 2026 en Madrid
// (UTC+2, lejos de cualquier cambio de hora). Su lunes 13 a las 00:00
// locales es 2026-04-12T22:00Z.
const FECHA_SEMANA = new Date('2026-04-15T13:00:00Z');
const ZONA = 'Europe/Madrid';

/** Intervalo en hora local de Madrid de un día de esa semana (0 = lunes). */
function cita(dia: number, horaInicio: number, horaFin: number) {
  // El lunes a las 00:00 locales es 2026-04-12T22:00Z; en abril el desfase es
  // constante (UTC+2), así que la hora local H es base + H horas.
  const base = new Date('2026-04-12T22:00:00Z').getTime();
  const diaMs = dia * 24 * 3_600_000;
  return {
    inicio: new Date(base + diaMs + horaInicio * 3_600_000),
    fin: new Date(base + diaMs + horaFin * 3_600_000),
  };
}

describe('colocarEnRejilla · colocación básica', () => {
  it('una cita de lunes 10:00-10:50 va al día 0, minuto 600, duración 50, sola en su grupo', () => {
    const [celda] = colocarEnRejilla([cita(0, 10, 10 + 50 / 60)], FECHA_SEMANA, ZONA);

    expect(celda).toEqual({
      indice: 0,
      dia: 0,
      inicioMinutos: 600,
      duracionMinutos: 50,
      columna: 0,
      columnasEnGrupo: 1,
    });
  });

  it('un intervalo fuera de la semana no produce celda', () => {
    const fuera = {
      inicio: new Date('2026-05-01T08:00:00Z'),
      fin: new Date('2026-05-01T09:00:00Z'),
    };
    expect(colocarEnRejilla([fuera], FECHA_SEMANA, ZONA)).toEqual([]);
  });

  it('un intervalo degenerado (fin antes que inicio) no produce celda ni rompe', () => {
    const degenerado = {
      inicio: new Date('2026-04-13T10:00:00Z'),
      fin: new Date('2026-04-13T09:00:00Z'),
    };
    expect(colocarEnRejilla([degenerado], FECHA_SEMANA, ZONA)).toEqual([]);
  });
});

describe('colocarEnRejilla · grupos de solape', () => {
  it('tres citas encadenadas (A-B, B-C) forman un grupo de tres columnas y la cuarta va sola', () => {
    // A 09:00-10:00, B 09:30-10:30, C 10:00-11:00 (A y C NO se tocan: semiabierto),
    // D 12:00-13:00, aparte.
    const celdas = colocarEnRejilla(
      [cita(0, 9, 10), cita(0, 9.5, 10.5), cita(0, 10, 11), cita(0, 12, 13)],
      FECHA_SEMANA,
      ZONA,
    );

    expect(celdas).toHaveLength(4);
    for (const celda of celdas.slice(0, 3)) {
      expect(celda.columnasEnGrupo).toBe(3);
    }
    expect(new Set(celdas.slice(0, 3).map((c) => c.columna))).toEqual(new Set([0, 1, 2]));

    expect(celdas[3].columna).toBe(0);
    expect(celdas[3].columnasEnGrupo).toBe(1);
  });

  it('dos citas idénticas reciben columnas distintas y el resultado no depende del orden de entrada', () => {
    const x = cita(2, 10, 11);
    const y = cita(2, 10, 11);

    const enOrden = colocarEnRejilla([x, y], FECHA_SEMANA, ZONA);
    const alReves = colocarEnRejilla([y, x], FECHA_SEMANA, ZONA);

    expect(enOrden).toHaveLength(2);
    expect(enOrden[0].columna).not.toBe(enOrden[1].columna);
    expect(enOrden[0].columnasEnGrupo).toBe(2);
    // Mismo conjunto de entrada → misma salida, celda a celda.
    expect(alReves).toEqual(enOrden);
  });

  it('a igualdad de inicio, la más corta va primero (desempate explícito por fin)', () => {
    const larga = cita(1, 10, 12);
    const corta = cita(1, 10, 11);

    const celdas = colocarEnRejilla([larga, corta], FECHA_SEMANA, ZONA);

    expect(celdas[0]).toMatchObject({ indice: 1, columna: 0, duracionMinutos: 60 });
    expect(celdas[1]).toMatchObject({ indice: 0, columna: 1, duracionMinutos: 120 });
  });
});

describe('colocarEnRejilla · cita que cruza la medianoche', () => {
  it('se parte en dos tramos con el mismo índice, uno por día', () => {
    // Martes 22:00 → miércoles 02:00 (una guardia).
    const guardia = {
      inicio: new Date('2026-04-14T20:00:00Z'),
      fin: new Date('2026-04-15T00:00:00Z'),
    };

    const celdas = colocarEnRejilla([guardia], FECHA_SEMANA, ZONA);

    expect(celdas).toEqual([
      { indice: 0, dia: 1, inicioMinutos: 22 * 60, duracionMinutos: 120, columna: 0, columnasEnGrupo: 1 },
      { indice: 0, dia: 2, inicioMinutos: 0, duracionMinutos: 120, columna: 0, columnasEnGrupo: 1 },
    ]);
  });
});

describe('colocarEnRejilla · semana del cambio de hora', () => {
  // El salto de marzo de 2026 es el domingo 29: a las 02:00 CET las agujas
  // saltan a las 03:00 CEST. Ese domingo dura 23 horas reales.
  const SEMANA_SALTO = new Date('2026-03-25T12:00:00Z');

  it('el domingo del salto tiene 23 franjas: la cita de las 10:00 cae en el minuto 540, no 600', () => {
    // Domingo 29-03: las 00:00 locales son 2026-03-28T23:00Z (aún CET, UTC+1).
    // Las 10:00 locales ya son CEST (UTC+2): 2026-03-29T08:00Z. Desde las
    // 00:00 han pasado 9 horas reales, no 10, porque la hora 02:00-02:59 no
    // existió. La rejilla se construye sobre horas locales y ese día tiene
    // una franja menos: la cita debe caer en la franja 540 (la décima fila),
    // no en la 600, o quedaría desplazada una celda respecto a su etiqueta.
    const citaDomingo = {
      inicio: new Date('2026-03-29T08:00:00Z'),
      fin: new Date('2026-03-29T08:50:00Z'),
    };

    const [celda] = colocarEnRejilla([citaDomingo], SEMANA_SALTO, ZONA);

    expect(celda.dia).toBe(6);
    expect(celda.inicioMinutos).toBe(540);
    expect(celda.duracionMinutos).toBe(50);
  });

  it('el domingo del salto mide 1380 minutos (23 h) y el lunes siguiente vuelve a 1440', () => {
    // Guardia que cruza toda la noche del domingo al lunes: sus dos tramos
    // delimitan el día exacto.
    const todaLaNoche = {
      inicio: new Date('2026-03-28T23:00:00Z'), // domingo 00:00 local
      fin: new Date('2026-03-29T22:00:00Z'), // lunes 00:00 local
    };

    const celdas = colocarEnRejilla([todaLaNoche], SEMANA_SALTO, ZONA);

    expect(celdas).toHaveLength(1);
    expect(celdas[0].dia).toBe(6);
    expect(celdas[0].duracionMinutos).toBe(1380);
  });

  // El salto de octubre de 2026 es el domingo 25: a las 03:00 CEST las agujas
  // retroceden a las 02:00 CET. Ese domingo dura 25 horas reales y tiene una
  // franja que NO existe ningún otro día de la semana: los minutos absolutos
  // 1440-1500 (la vigésimoquinta hora, la repetición de las 02:00-03:00 en
  // hora de invierno). Una semana de referencia distinta a la de marzo,
  // porque marzo y octubre ejecutan el mismo código (decisión 1) y hay que
  // demostrarlo en los dos sentidos, no solo en el que resta.
  const SEMANA_SALTO_OCTUBRE = new Date('2026-10-21T10:00:00Z');

  it('el domingo del salto de octubre mide 1500 minutos (25 h) y admite una cita en la franja repetida (1440-1500)', () => {
    // Domingo 25-10: las 00:00 locales son 2026-10-25T22:00Z del sábado... en
    // realidad 2026-10-24T22:00Z (aún CEST, UTC+2). Una cita de 22:10 a 22:30
    // UTC del propio domingo 25 cae en los minutos 1450-1470 desde esas
    // 00:00 locales: una franja que solo existe este domingo porque la hora
    // 02:00-03:00 se vive dos veces (CEST y luego CET). Si la rejilla tratara
    // el día como si tuviera 1440 minutos, esta cita se perdería o se
    // desplazaría de día.
    const citaEnLaHoraRepetida = {
      inicio: new Date('2026-10-25T22:10:00Z'),
      fin: new Date('2026-10-25T22:30:00Z'),
    };

    const [celda] = colocarEnRejilla([citaEnLaHoraRepetida], SEMANA_SALTO_OCTUBRE, ZONA);

    expect(celda.dia).toBe(6);
    expect(celda.inicioMinutos).toBe(1450);
    expect(celda.duracionMinutos).toBe(20);
  });

  it('el domingo del salto de octubre mide 1500 minutos (25 h) y el lunes siguiente vuelve a 1440', () => {
    // Guardia que cruza toda la noche del domingo al lunes: sus dos tramos
    // delimitan el día exacto, igual que en marzo pero sumando en vez de
    // restando una hora.
    const todaLaNoche = {
      inicio: new Date('2026-10-24T22:00:00Z'), // domingo 00:00 local (CEST, UTC+2)
      fin: new Date('2026-10-25T23:00:00Z'), // lunes 00:00 local (CET, UTC+1)
    };

    const celdas = colocarEnRejilla([todaLaNoche], SEMANA_SALTO_OCTUBRE, ZONA);

    expect(celdas).toHaveLength(1);
    expect(celdas[0].dia).toBe(6);
    expect(celdas[0].duracionMinutos).toBe(1500);
  });
});
