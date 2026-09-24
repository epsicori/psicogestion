import { describe, expect, it } from 'vitest';

import { colocarEnRejilla, type CitaParaRejilla } from './rejilla';

// Semana de referencia: la del miércoles 15 de abril de 2026 en Madrid
// (UTC+2, lejos de cualquier cambio de hora). Su lunes 13 a las 00:00
// locales es 2026-04-12T22:00Z.
const FECHA_SEMANA = new Date('2026-04-15T13:00:00Z');
const ZONA = 'Europe/Madrid';

/** Intervalo en hora local de Madrid de un día de esa semana (0 = lunes). */
function cita(id: string, dia: number, horaInicio: number, horaFin: number): CitaParaRejilla {
  // El lunes a las 00:00 locales es 2026-04-12T22:00Z; en abril el desfase es
  // constante (UTC+2), así que la hora local H es base + H horas.
  const base = new Date('2026-04-12T22:00:00Z').getTime();
  const diaMs = dia * 24 * 3_600_000;
  return {
    id,
    inicio: new Date(base + diaMs + horaInicio * 3_600_000),
    fin: new Date(base + diaMs + horaFin * 3_600_000),
  };
}

describe('colocarEnRejilla · colocación básica', () => {
  it('una cita de lunes 10:00-10:50 va al día 0, minuto 600, duración 50, sola en su grupo', () => {
    const [celda] = colocarEnRejilla([cita('a', 0, 10, 10 + 50 / 60)], FECHA_SEMANA, ZONA);

    expect(celda).toEqual({
      id: 'a',
      dia: 0,
      inicioMinutos: 600,
      duracionMinutos: 50,
      columna: 0,
      columnasEnGrupo: 1,
    });
  });

  it('un intervalo fuera de la semana no produce celda', () => {
    const fuera: CitaParaRejilla = {
      id: 'fuera',
      inicio: new Date('2026-05-01T08:00:00Z'),
      fin: new Date('2026-05-01T09:00:00Z'),
    };
    expect(colocarEnRejilla([fuera], FECHA_SEMANA, ZONA)).toEqual([]);
  });

  it('un intervalo degenerado (fin antes que inicio) no produce celda ni rompe', () => {
    const degenerado: CitaParaRejilla = {
      id: 'degenerado',
      inicio: new Date('2026-04-13T10:00:00Z'),
      fin: new Date('2026-04-13T09:00:00Z'),
    };
    expect(colocarEnRejilla([degenerado], FECHA_SEMANA, ZONA)).toEqual([]);
  });
});

describe('colocarEnRejilla · fecha inválida (H6)', () => {
  // Decisión 2: `NaN` en cualquier comparación da `false`, así que sin una
  // guarda explícita el recorte por día ("¿cae dentro de este día?") elige
  // siempre el límite del día en vez del propio instante inválido, y la cita
  // se estira en silencio hasta ocupar la semana entera. La cita inválida se
  // descarta ENTERA: no produce ningún tramo, en ningún día.
  it('una cita con fin inválido se descarta entera, no se estira hasta el fin de la semana', () => {
    const valida = cita('valida', 0, 9, 10);
    const finInvalido: CitaParaRejilla = {
      id: 'fin-invalido',
      inicio: new Date('2026-04-13T10:00:00Z'),
      fin: new Date('fecha-que-no-existe'),
    };

    const celdas = colocarEnRejilla([valida, finInvalido], FECHA_SEMANA, ZONA);

    expect(celdas).toHaveLength(1);
    expect(celdas[0].id).toBe('valida');
  });

  it('una cita con inicio inválido también se descarta', () => {
    const inicioInvalido: CitaParaRejilla = {
      id: 'inicio-invalido',
      inicio: new Date(Number.NaN),
      fin: new Date('2026-04-13T10:00:00Z'),
    };

    expect(colocarEnRejilla([inicioInvalido], FECHA_SEMANA, ZONA)).toEqual([]);
  });
});

describe('colocarEnRejilla · semana o zona inválidas (H8)', () => {
  // Una rejilla vacía en pantalla se lee como «semana sin citas». Si la semana
  // pedida o la zona no valen, eso no es una semana vacía: es un error, y
  // tiene que llegar al error.tsx en vez de callar.
  const valida = cita('valida', 0, 10, 11);

  it('una fecha de semana inválida lanza, no devuelve una semana vacía', () => {
    expect(() => colocarEnRejilla([valida], new Date('x'), ZONA)).toThrow(/semana/);
  });

  it('una zona desconocida lanza, no devuelve una semana vacía', () => {
    expect(() => colocarEnRejilla([valida], FECHA_SEMANA, 'Europa/Madriz')).toThrow(/semana/);
  });

  it('gemela positiva: la misma cita con semana y zona válidas sí se coloca', () => {
    expect(colocarEnRejilla([valida], FECHA_SEMANA, ZONA)).toHaveLength(1);
  });

  it('una semana válida sin citas sigue siendo una lista vacía, no un error', () => {
    expect(colocarEnRejilla([], FECHA_SEMANA, ZONA)).toEqual([]);
  });
});

describe('colocarEnRejilla · grupos de solape', () => {
  it('tres citas encadenadas (A-B, B-C) forman un grupo de tres columnas y la cuarta va sola', () => {
    // A 09:00-10:00, B 09:30-10:30, C 10:00-11:00 (A y C NO se tocan: semiabierto),
    // D 12:00-13:00, aparte.
    const celdas = colocarEnRejilla(
      [cita('a', 0, 9, 10), cita('b', 0, 9.5, 10.5), cita('c', 0, 10, 11), cita('d', 0, 12, 13)],
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

  it('dos citas idénticas reciben columnas distintas y CADA UNA conserva su columna sea cual sea el orden de entrada (H5)', () => {
    // Mismo horario, ids distintos (la identidad real que aporta el
    // llamante: decisión 4). Antes del arreglo el desempate final era
    // `a.indice - b.indice` (la posición en el array de ENTRADA), así que
    // esta misma cita cambiaba de columna según el orden en que Postgres
    // devolviera la fila. Ahora el desempate es por `id`, así que comparamos
    // por id — no por posición — y exigimos que la columna de cada id sea
    // estable entre las dos llamadas.
    const x = cita('x', 2, 10, 11);
    const y = cita('y', 2, 10, 11);

    const enOrden = colocarEnRejilla([x, y], FECHA_SEMANA, ZONA);
    const alReves = colocarEnRejilla([y, x], FECHA_SEMANA, ZONA);

    const columnaDe = (celdas: typeof enOrden, id: string) =>
      celdas.find((c) => c.id === id)?.columna;

    expect(enOrden).toHaveLength(2);
    expect(alReves).toHaveLength(2);
    expect(columnaDe(enOrden, 'x')).not.toBe(columnaDe(enOrden, 'y'));
    // La comprobación que discrimina: la MISMA cita (por id) recibe la MISMA
    // columna sin importar en qué posición llegó. Con el desempate por
    // posición esto fallaba: 'x' era columna 0 en un orden y columna 1 en el
    // otro.
    expect(columnaDe(alReves, 'x')).toBe(columnaDe(enOrden, 'x'));
    expect(columnaDe(alReves, 'y')).toBe(columnaDe(enOrden, 'y'));
  });

  it('a igualdad de inicio, la más corta va primero (desempate explícito por fin)', () => {
    const larga = cita('larga', 1, 10, 12);
    const corta = cita('corta', 1, 10, 11);

    const celdas = colocarEnRejilla([larga, corta], FECHA_SEMANA, ZONA);

    expect(celdas[0]).toMatchObject({ id: 'corta', columna: 0, duracionMinutos: 60 });
    expect(celdas[1]).toMatchObject({ id: 'larga', columna: 1, duracionMinutos: 120 });
  });

  it('dos tramos con el mismo id, inicio y fin (duplicado exacto) no rompen el orden total', () => {
    // Ejercita la rama `a === b` de `compararIds`: el comparador de la
    // decisión 4 tiene que ser un orden total incluso cuando los tres
    // criterios (inicio, fin, id) coinciden — el caso de un duplicado
    // literal en la entrada, que ningún desempate anterior cubría.
    const duplicada = cita('repetida', 3, 9, 10);
    const otraDuplicada = cita('repetida', 3, 9, 10);

    const celdas = colocarEnRejilla([duplicada, otraDuplicada], FECHA_SEMANA, ZONA);

    expect(celdas).toHaveLength(2);
    expect(celdas[0].id).toBe('repetida');
    expect(celdas[1].id).toBe('repetida');
    expect(new Set(celdas.map((c) => c.columna))).toEqual(new Set([0, 1]));
  });
});

describe('colocarEnRejilla · cita que cruza la medianoche', () => {
  it('se parte en dos tramos con el mismo id, uno por día', () => {
    // Martes 22:00 → miércoles 02:00 (una guardia).
    const guardia: CitaParaRejilla = {
      id: 'guardia',
      inicio: new Date('2026-04-14T20:00:00Z'),
      fin: new Date('2026-04-15T00:00:00Z'),
    };

    const celdas = colocarEnRejilla([guardia], FECHA_SEMANA, ZONA);

    expect(celdas).toEqual([
      { id: 'guardia', dia: 1, inicioMinutos: 22 * 60, duracionMinutos: 120, columna: 0, columnasEnGrupo: 1 },
      { id: 'guardia', dia: 2, inicioMinutos: 0, duracionMinutos: 120, columna: 0, columnasEnGrupo: 1 },
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
    const citaDomingo: CitaParaRejilla = {
      id: 'cita-domingo',
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
    const todaLaNoche: CitaParaRejilla = {
      id: 'toda-la-noche-marzo',
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
  // 120-240 (la hora 02:00-03:00, vivida dos veces: primero en CEST, luego en
  // CET, tras retroceder). Una semana de referencia distinta a la de marzo,
  // porque marzo y octubre ejecutan el mismo código (decisión 1) y hay que
  // demostrarlo en los dos sentidos, no solo en el que resta.
  const SEMANA_SALTO_OCTUBRE = new Date('2026-10-21T10:00:00Z');

  it('el domingo del salto de octubre mide 1500 minutos (25 h): una cita tardía cae en la franja que solo existe ese día', () => {
    // Domingo 25-10: las 00:00 locales son 2026-10-24T22:00Z (aún CEST,
    // UTC+2). Una cita de 22:10 a 22:30 UTC del propio domingo 25 cae en los
    // minutos 1450-1470 desde esas 00:00 locales: una franja que solo existe
    // este domingo porque el día tiene 25 horas reales (1500 minutos) en vez
    // de 24 (1440). NO es la hora repetida en sí (esa es la 02:00-03:00,
    // minutos absolutos 120-240: se vive una vez en CEST —minutos 120-180— y
    // otra en CET tras el retroceso —minutos 180-240—); es una cita tardía
    // que demuestra que el día llega hasta el minuto 1500 y no se corta en
    // 1440, que es lo que de verdad hay que probar aquí (H7: el comentario
    // anterior decía 1440-1500 para "la hora repetida", pero la hora
    // repetida cae en 120-240, no ahí).
    const citaTardia: CitaParaRejilla = {
      id: 'cita-tardia-octubre',
      inicio: new Date('2026-10-25T22:10:00Z'),
      fin: new Date('2026-10-25T22:30:00Z'),
    };

    const [celda] = colocarEnRejilla([citaTardia], SEMANA_SALTO_OCTUBRE, ZONA);

    expect(celda.dia).toBe(6);
    expect(celda.inicioMinutos).toBe(1450);
    expect(celda.duracionMinutos).toBe(20);
  });

  it('el domingo del salto de octubre mide 1500 minutos (25 h) y el lunes siguiente vuelve a 1440', () => {
    // Guardia que cruza toda la noche del domingo al lunes: sus dos tramos
    // delimitan el día exacto, igual que en marzo pero sumando en vez de
    // restando una hora.
    const todaLaNoche: CitaParaRejilla = {
      id: 'toda-la-noche-octubre',
      inicio: new Date('2026-10-24T22:00:00Z'), // domingo 00:00 local (CEST, UTC+2)
      fin: new Date('2026-10-25T23:00:00Z'), // lunes 00:00 local (CET, UTC+1)
    };

    const celdas = colocarEnRejilla([todaLaNoche], SEMANA_SALTO_OCTUBRE, ZONA);

    expect(celdas).toHaveLength(1);
    expect(celdas[0].dia).toBe(6);
    expect(celdas[0].duracionMinutos).toBe(1500);
  });
});
