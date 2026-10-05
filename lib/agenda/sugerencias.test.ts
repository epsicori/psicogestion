import { describe, expect, it } from 'vitest';

import { diaDeLaSemana, sumarDias } from '@/lib/fechas/calendario';

import { sugerirHuecos, type BloqueLibre, type CitaPasada } from './sugerencias';

const pasada = (fecha: string, horaLocal = '12:00'): CitaPasada => ({
  fecha,
  diaSemana: diaDeLaSemana(fecha),
  horaLocal,
});
const bloque = (fecha: string, horaLocal = '12:00'): BloqueLibre => ({
  fecha,
  horaLocal,
  diaSemana: diaDeLaSemana(fecha),
});
const pasadas = (fechas: string[], hora = '12:00') => fechas.map((f) => pasada(f, hora));
const claves = (r: { sugerencias: { fecha: string; horaLocal: string }[] }) =>
  r.sugerencias.map((s) => `${s.fecha}T${s.horaLocal}`);

// Seis martes seguidos a las 12:00 (el último, 2026-09-29).
const SEIS_MARTES = [
  '2026-08-25',
  '2026-09-01',
  '2026-09-08',
  '2026-09-15',
  '2026-09-22',
  '2026-09-29',
];
const HOY = '2026-10-02'; // viernes

describe('sugerirHuecos · habitual frente a en frío (umbrales)', () => {
  const libres = [bloque('2026-10-06'), bloque('2026-10-07', '09:00'), bloque('2026-10-13')];

  it('0, 1 y 2 pasadas: en frío, aunque coincidan en todo', () => {
    for (const n of [0, 1, 2]) {
      const r = sugerirHuecos({ pasadas: pasadas(SEIS_MARTES.slice(0, n)), libres, hoy: HOY });
      expect(r.modo).toBe('enFrio');
    }
  });

  it('3 pasadas sin moda de intervalo (7 y 14, frecuencia 1): en frío, todo primerHueco', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(['2026-09-01', '2026-09-08', '2026-09-22']),
      libres,
      hoy: HOY,
    });
    expect(r.modo).toBe('enFrio');
    expect(r.sugerencias.every((s) => s.motivo.tipo === 'primerHueco')).toBe(true);
  });

  it('3 pasadas con moda de intervalo, día y hora: habitual', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(['2026-09-15', '2026-09-22', '2026-09-29']),
      libres,
      hoy: HOY,
    });
    expect(r.modo).toBe('habitual');
  });

  it('moda de intervalo pero sin moda de día: en frío', () => {
    // 09-01 mar, 09-09 mié, 09-17 jue: intervalos 8 y 8, tres días distintos
    const r = sugerirHuecos({
      pasadas: pasadas(['2026-09-01', '2026-09-09', '2026-09-17']),
      libres,
      hoy: HOY,
    });
    expect(r.modo).toBe('enFrio');
  });

  it('moda de intervalo y de día pero sin moda de hora: en frío', () => {
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-09-15', '10:00'),
        pasada('2026-09-22', '11:00'),
        pasada('2026-09-29', '12:00'),
      ],
      libres,
      hoy: HOY,
    });
    expect(r.modo).toBe('enFrio');
  });

  it('la hora habitual se cuenta solo entre las citas del día habitual', () => {
    // Martes (3): 10:00, 10:00, 11:00; jueves (2) a las 11:00. En global la hora más
    // frecuente es 11:00 (3), pero entre martes es 10:00. Intervalos 2,5,2,5 -> moda 2.
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-09-01', '10:00'),
        pasada('2026-09-03', '11:00'),
        pasada('2026-09-08', '10:00'),
        pasada('2026-09-10', '11:00'),
        pasada('2026-09-15', '11:00'),
      ],
      libres: [bloque('2026-10-06', '11:00'), bloque('2026-10-06', '10:00')],
      hoy: HOY,
    });
    expect(r.modo).toBe('habitual');
    expect(r.sugerencias[0]).toEqual({
      fecha: '2026-10-06',
      horaLocal: '10:00',
      motivo: { tipo: 'diaHabitual', diaSemana: 2, hora: '10:00' },
    });
  });
});

describe('sugerirHuecos · en frío', () => {
  it('los tres primeros libres posteriores a hoy, todos primerHueco', () => {
    const libres = [
      bloque('2026-10-01'), // antes de hoy
      bloque('2026-10-02'), // hoy
      bloque('2026-10-05', '09:00'),
      bloque('2026-10-05', '10:00'),
      bloque('2026-10-06'),
      bloque('2026-10-07'),
    ];
    expect(sugerirHuecos({ pasadas: [], libres, hoy: HOY })).toEqual({
      modo: 'enFrio',
      sugerencias: [
        { fecha: '2026-10-05', horaLocal: '09:00', motivo: { tipo: 'primerHueco' } },
        { fecha: '2026-10-05', horaLocal: '10:00', motivo: { tipo: 'primerHueco' } },
        { fecha: '2026-10-06', horaLocal: '12:00', motivo: { tipo: 'primerHueco' } },
      ],
    });
  });

  it('libres vacío: sin sugerencias, en frío y en habitual', () => {
    expect(sugerirHuecos({ pasadas: [], libres: [], hoy: HOY })).toEqual({
      modo: 'enFrio',
      sugerencias: [],
    });
    expect(sugerirHuecos({ pasadas: pasadas(SEIS_MARTES), libres: [], hoy: HOY })).toEqual({
      modo: 'habitual',
      sugerencias: [],
    });
  });

  it('menos de tres libres: devuelve los que hay', () => {
    const r = sugerirHuecos({ pasadas: [], libres: [bloque('2026-10-06')], hoy: HOY });
    expect(r.sugerencias).toHaveLength(1);
  });

  it('excluir descarta ese bloque', () => {
    const r = sugerirHuecos({
      pasadas: [],
      libres: [
        bloque('2026-10-06'),
        bloque('2026-10-07'),
        bloque('2026-10-08'),
        bloque('2026-10-09'),
      ],
      hoy: HOY,
      excluir: ['2026-10-06T12:00'],
    });
    expect(r.sugerencias.map((s) => s.fecha)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
  });

  it('excluir afecta solo a la fecha y la hora exactas', () => {
    const r = sugerirHuecos({
      pasadas: [],
      libres: [bloque('2026-10-06', '12:00'), bloque('2026-10-06', '13:00')],
      hoy: HOY,
      excluir: ['2026-10-06T12:00'],
    });
    expect(r.sugerencias.map((s) => s.horaLocal)).toEqual(['13:00']);
  });
});

describe('sugerirHuecos · habitual', () => {
  it('seis martes a las 12: 1.ª «como las seis últimas», 2.ª día habitual, 3.ª primer hueco', () => {
    const libres = [
      bloque('2026-10-05', '09:00'),
      bloque('2026-10-06', '12:00'),
      bloque('2026-10-13', '12:00'),
      bloque('2026-10-20', '12:00'),
    ];
    const r = sugerirHuecos({ pasadas: pasadas(SEIS_MARTES), libres, hoy: HOY });
    expect(r).toEqual({
      modo: 'habitual',
      sugerencias: [
        { fecha: '2026-10-06', horaLocal: '12:00', motivo: { tipo: 'comoLasUltimas', n: 6 } },
        {
          fecha: '2026-10-13',
          horaLocal: '12:00',
          motivo: { tipo: 'diaHabitual', diaSemana: 2, hora: '12:00' },
        },
        { fecha: '2026-10-05', horaLocal: '09:00', motivo: { tipo: 'primerHueco' } },
      ],
    });
  });

  it('n es el número de pasadas cuando son menos de seis', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(['2026-09-15', '2026-09-22', '2026-09-29']),
      libres: [bloque('2026-10-06')],
      hoy: HOY,
    });
    expect(r.sugerencias[0].motivo).toEqual({ tipo: 'comoLasUltimas', n: 3 });
  });

  it('(a) cadaIntervalo: hay modas pero no todas las pasadas coinciden en día y hora', () => {
    // martes 12:00 x3 y un jueves: intervalos 7, 7, 2 -> moda 7; objetivo 10-01 <= hoy -> 10-08
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-09-08'),
        pasada('2026-09-15'),
        pasada('2026-09-22'),
        pasada('2026-09-24'), // jueves
      ],
      libres: [bloque('2026-10-08')],
      hoy: HOY,
    });
    expect(r.modo).toBe('habitual');
    expect(r.sugerencias[0]).toEqual({
      fecha: '2026-10-08',
      horaLocal: '12:00',
      motivo: { tipo: 'cadaIntervalo', dias: 7 },
    });
  });

  it('(a) cadaIntervalo también cuando solo la hora de la última difiere', () => {
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-09-08', '12:00'),
        pasada('2026-09-15', '12:00'),
        pasada('2026-09-22', '12:00'),
        pasada('2026-09-29', '13:00'),
      ],
      libres: [bloque('2026-10-06', '12:00')],
      hoy: HOY,
    });
    expect(r.sugerencias[0]).toEqual({
      fecha: '2026-10-06',
      horaLocal: '12:00',
      motivo: { tipo: 'cadaIntervalo', dias: 7 },
    });
  });

  it('(a) intervalo de 14 días: el objetivo es la última + 14 (no + 7)', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(['2026-09-01', '2026-09-15', '2026-09-29']),
      libres: [bloque('2026-10-06'), bloque('2026-10-13')],
      hoy: HOY,
    });
    expect(r.sugerencias[0]).toEqual({
      fecha: '2026-10-13',
      horaLocal: '12:00',
      motivo: { tipo: 'comoLasUltimas', n: 3 },
    });
  });

  it('moda de intervalo con empate: el menor', () => {
    // intervalos 14, 14, 7, 7: empate 2-2 -> 7; última 09-01 + 7 = 09-08
    const r = sugerirHuecos({
      pasadas: pasadas(['2026-07-21', '2026-08-04', '2026-08-18', '2026-08-25', '2026-09-01']),
      libres: [bloque('2026-09-08'), bloque('2026-09-15')],
      hoy: '2026-09-02',
    });
    expect(r.modo).toBe('habitual');
    expect(r.sugerencias[0].fecha).toBe('2026-09-08');
  });

  it('el objetivo se avanza de intervalo en intervalo hasta ser posterior a hoy', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(SEIS_MARTES),
      libres: [
        bloque('2026-10-06'),
        bloque('2026-10-13'),
        bloque('2026-10-20'),
        bloque('2026-10-27'),
      ],
      hoy: '2026-10-20',
    });
    expect(r.sugerencias[0]).toEqual({
      fecha: '2026-10-27',
      horaLocal: '12:00',
      motivo: { tipo: 'comoLasUltimas', n: 6 },
    });
  });

  it('un objetivo igual a hoy se avanza (ha de ser > hoy)', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(SEIS_MARTES),
      libres: [bloque('2026-10-06'), bloque('2026-10-13')],
      hoy: '2026-10-06',
    });
    expect(r.sugerencias[0].fecha).toBe('2026-10-13');
  });

  it('(b) sin hueco en el objetivo: día habitual a la hora habitual, y (c) rellena', () => {
    const libres = [
      bloque('2026-10-05', '09:00'),
      bloque('2026-10-13', '12:00'), // no es el objetivo (10-06)
      bloque('2026-10-14', '10:00'),
      bloque('2026-10-15', '10:00'),
    ];
    const r = sugerirHuecos({ pasadas: pasadas(SEIS_MARTES), libres, hoy: HOY });
    expect(r.sugerencias).toEqual([
      {
        fecha: '2026-10-13',
        horaLocal: '12:00',
        motivo: { tipo: 'diaHabitual', diaSemana: 2, hora: '12:00' },
      },
      { fecha: '2026-10-05', horaLocal: '09:00', motivo: { tipo: 'primerHueco' } },
      { fecha: '2026-10-14', horaLocal: '10:00', motivo: { tipo: 'primerHueco' } },
    ]);
  });

  it('(b) no es un bloque de otro día ni de otra hora', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(SEIS_MARTES),
      libres: [bloque('2026-10-07', '12:00'), bloque('2026-10-13', '13:00')],
      hoy: HOY,
    });
    expect(r.sugerencias.map((s) => s.motivo.tipo)).toEqual(['primerHueco', 'primerHueco']);
  });

  it('(b) no repite el bloque del objetivo', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(SEIS_MARTES),
      libres: [bloque('2026-10-06'), bloque('2026-10-13')],
      hoy: HOY,
    });
    expect(claves(r)).toEqual(['2026-10-06T12:00', '2026-10-13T12:00']);
  });

  it('(c) rellena con primerHueco hasta 3 sin repetir bloque', () => {
    const libres = [
      bloque('2026-10-06', '12:00'),
      bloque('2026-10-06', '13:00'),
      bloque('2026-10-07', '10:00'),
      bloque('2026-10-08', '10:00'),
    ];
    const r = sugerirHuecos({ pasadas: pasadas(SEIS_MARTES), libres, hoy: HOY });
    expect(r.sugerencias).toEqual([
      { fecha: '2026-10-06', horaLocal: '12:00', motivo: { tipo: 'comoLasUltimas', n: 6 } },
      { fecha: '2026-10-06', horaLocal: '13:00', motivo: { tipo: 'primerHueco' } },
      { fecha: '2026-10-07', horaLocal: '10:00', motivo: { tipo: 'primerHueco' } },
    ]);
  });

  it('excluir quita el hueco habitual y pasa al siguiente', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(SEIS_MARTES),
      libres: [bloque('2026-10-06'), bloque('2026-10-13'), bloque('2026-10-20')],
      hoy: HOY,
      excluir: ['2026-10-06T12:00'],
    });
    expect(claves(r)).toEqual(['2026-10-13T12:00', '2026-10-20T12:00']);
    expect(r.sugerencias[0].motivo.tipo).toBe('diaHabitual');
  });

  it('nunca sugiere bloques en hoy o antes', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(SEIS_MARTES),
      libres: [
        bloque('2026-09-29'),
        bloque('2026-10-01'),
        bloque('2026-10-02', '12:00'),
        bloque('2026-10-06'),
      ],
      hoy: HOY,
    });
    expect(r.sugerencias.map((s) => s.fecha)).toEqual(['2026-10-06']);
  });

  it('cruza el cambio de hora de marzo (domingo 28): fechas de calendario', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(['2027-03-08', '2027-03-15', '2027-03-22'], '09:30'),
      libres: [bloque('2027-03-29', '09:30'), bloque('2027-04-05', '09:30')],
      hoy: '2027-03-23',
    });
    expect(r.sugerencias[0]).toEqual({
      fecha: '2027-03-29',
      horaLocal: '09:30',
      motivo: { tipo: 'comoLasUltimas', n: 3 },
    });
    expect(r.sugerencias[1].fecha).toBe('2027-04-05');
  });

  it('cruza el cambio de hora de octubre (domingo 25) con intervalo semanal', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(['2026-10-12', '2026-10-19', '2026-10-26'], '17:00'),
      libres: [bloque('2026-11-02', '17:00')],
      hoy: '2026-10-27',
    });
    expect(r.sugerencias[0].fecha).toBe('2026-11-02');
  });

  it('cruza el cambio de año', () => {
    expect(sumarDias('2026-12-28', 7)).toBe('2027-01-04'); // control del propio caso
    const r = sugerirHuecos({
      pasadas: pasadas(['2026-12-14', '2026-12-21', '2026-12-28']),
      libres: [bloque('2027-01-04'), bloque('2027-01-11')],
      hoy: '2026-12-30',
    });
    expect(r.sugerencias[0]).toEqual({
      fecha: '2027-01-04',
      horaLocal: '12:00',
      motivo: { tipo: 'comoLasUltimas', n: 3 },
    });
  });

  it('los motivos solo llevan las claves del contrato (sin tipo de terapia ni modalidad)', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(SEIS_MARTES),
      libres: [bloque('2026-10-06'), bloque('2026-10-13'), bloque('2026-10-14')],
      hoy: HOY,
    });
    expect(r.sugerencias.map((s) => Object.keys(s.motivo).sort())).toEqual([
      ['n', 'tipo'],
      ['diaSemana', 'hora', 'tipo'],
      ['tipo'],
    ]);
  });
});

describe('sugerirHuecos · ronda 1 del corte A (E12-E15, H1, H2, H6)', () => {
  const MENSUAL = ['2026-06-09', '2026-07-07', '2026-08-04', '2026-09-01', '2026-09-29'];

  it('H2 · (a) toma la hora habitual aunque haya un hueco más temprano ese mismo día', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(SEIS_MARTES),
      libres: [bloque('2026-10-06', '09:00'), bloque('2026-10-06', '12:00')],
      hoy: HOY,
    });
    expect(r.sugerencias[0]).toEqual({
      fecha: '2026-10-06',
      horaLocal: '12:00',
      motivo: { tipo: 'comoLasUltimas', n: 6 },
    });
    expect(r.sugerencias[1]).toEqual({
      fecha: '2026-10-06',
      horaLocal: '09:00',
      motivo: { tipo: 'primerHueco' },
    });
  });

  it('H6 · intervalo quincenal: el objetivo avanza de 14 en 14 hasta ser posterior a hoy', () => {
    // objetivos 09-15, 09-29, 10-13: con +7 caería en 10-06
    const r = sugerirHuecos({
      pasadas: pasadas(['2026-08-04', '2026-08-18', '2026-09-01']),
      libres: [bloque('2026-10-06'), bloque('2026-10-13')],
      hoy: HOY,
    });
    expect(r.sugerencias[0]).toEqual({
      fecha: '2026-10-13',
      horaLocal: '12:00',
      motivo: { tipo: 'comoLasUltimas', n: 3 },
    });
  });

  it('H6 · cadaIntervalo lleva el intervalo modal, no un 7 fijo', () => {
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-07-21'),
        pasada('2026-08-04'),
        pasada('2026-08-18'),
        pasada('2026-09-01', '13:00'),
      ],
      libres: [bloque('2026-10-13')],
      hoy: HOY,
    });
    expect(r.sugerencias[0]).toEqual({
      fecha: '2026-10-13',
      horaLocal: '12:00',
      motivo: { tipo: 'cadaIntervalo', dias: 14 },
    });
  });

  it('E12 · (b) mensual con el objetivo ocupado: el día habitual se busca a partir del objetivo', () => {
    // intervalos de 28; objetivo 2026-10-27
    const r = sugerirHuecos({
      pasadas: pasadas(MENSUAL),
      libres: [
        bloque('2026-10-06'),
        bloque('2026-10-13'),
        bloque('2026-10-27', '09:00'),
        bloque('2026-11-03'),
      ],
      hoy: HOY,
    });
    expect(r.sugerencias).toEqual([
      {
        fecha: '2026-11-03',
        horaLocal: '12:00',
        motivo: { tipo: 'diaHabitual', diaSemana: 2, hora: '12:00' },
      },
      { fecha: '2026-10-06', horaLocal: '12:00', motivo: { tipo: 'primerHueco' } },
      { fecha: '2026-10-13', horaLocal: '12:00', motivo: { tipo: 'primerHueco' } },
    ]);
  });

  it('E12 · (b) mensual con el objetivo libre', () => {
    const r = sugerirHuecos({
      pasadas: pasadas(MENSUAL),
      libres: [bloque('2026-10-06'), bloque('2026-10-27'), bloque('2026-11-03')],
      hoy: HOY,
    });
    expect(r.sugerencias).toEqual([
      { fecha: '2026-10-27', horaLocal: '12:00', motivo: { tipo: 'comoLasUltimas', n: 5 } },
      {
        fecha: '2026-11-03',
        horaLocal: '12:00',
        motivo: { tipo: 'diaHabitual', diaSemana: 2, hora: '12:00' },
      },
      { fecha: '2026-10-06', horaLocal: '12:00', motivo: { tipo: 'primerHueco' } },
    ]);
  });

  it('E13 · sesión doble semanal: los intervalos 0 no cuentan, el paciente es habitual', () => {
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-09-15', '12:00'),
        pasada('2026-09-15', '13:00'),
        pasada('2026-09-22', '12:00'),
        pasada('2026-09-22', '13:00'),
        pasada('2026-09-29', '12:00'),
        pasada('2026-09-29', '13:00'),
      ],
      libres: [bloque('2026-10-06', '12:00'), bloque('2026-10-06', '13:00'), bloque('2026-10-13')],
      hoy: HOY,
    });
    expect(r).toEqual({
      modo: 'habitual',
      sugerencias: [
        { fecha: '2026-10-06', horaLocal: '12:00', motivo: { tipo: 'cadaIntervalo', dias: 7 } },
        {
          fecha: '2026-10-13',
          horaLocal: '12:00',
          motivo: { tipo: 'diaHabitual', diaSemana: 2, hora: '12:00' },
        },
        { fecha: '2026-10-06', horaLocal: '13:00', motivo: { tipo: 'primerHueco' } },
      ],
    });
  });

  // Si se quitan a la vez el filtro `> 0` y la guarda `intervaloModa > 0`, el `while` del
  // objetivo no termina: vitest no corta un bucle síncrono, es un rojo por cuelgue.
  it('E13 · tres citas el mismo día: en frío', () => {
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-09-29', '10:00'),
        pasada('2026-09-29', '11:00'),
        pasada('2026-09-29', '12:00'),
      ],
      libres: [bloque('2026-10-06'), bloque('2026-10-07', '10:00')],
      hoy: HOY,
    });
    expect(r.modo).toBe('enFrio');
    expect(r.sugerencias.every((s) => s.motivo.tipo === 'primerHueco')).toBe(true);
  });

  it('E14 · dos días distintos con sesión doble: en frío (un solo intervalo de 7, frecuencia 1)', () => {
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-09-22', '12:00'),
        pasada('2026-09-22', '13:00'),
        pasada('2026-09-29', '12:00'),
        pasada('2026-09-29', '13:00'),
      ],
      libres: [bloque('2026-10-06')],
      hoy: HOY,
    });
    expect(r.modo).toBe('enFrio');
  });

  const LIBRES_CENTRAL = [
    bloque('2026-10-05', '09:00'),
    bloque('2026-10-06', '12:00'),
    bloque('2026-10-13', '12:00'),
    bloque('2026-10-20', '12:00'),
  ];

  it('E15 · pasadas en orden descendente: mismo resultado que en ascendente, sin mutar la entrada', () => {
    const ascendente = sugerirHuecos({
      pasadas: pasadas(SEIS_MARTES),
      libres: LIBRES_CENTRAL,
      hoy: HOY,
    });
    const descendente = pasadas([...SEIS_MARTES].reverse());
    const copia = descendente.map((p) => ({ ...p }));
    const r = sugerirHuecos({ pasadas: descendente, libres: LIBRES_CENTRAL, hoy: HOY });
    expect(r).toEqual(ascendente);
    expect(r.modo).toBe('habitual');
    expect(descendente).toEqual(copia);
  });

  it('E15 · más de seis pasadas: cuenta las seis más recientes', () => {
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-08-13', '10:00'),
        pasada('2026-08-20', '10:00'),
        ...pasadas(SEIS_MARTES),
      ],
      libres: [bloque('2026-10-06')],
      hoy: HOY,
    });
    expect(r.sugerencias[0]).toEqual({
      fecha: '2026-10-06',
      horaLocal: '12:00',
      motivo: { tipo: 'comoLasUltimas', n: 6 },
    });
  });

  it('E15 · hoy mal formado: lanza', () => {
    for (const hoy of ['2026-10-2', '2026-02-30']) {
      expect(() =>
        sugerirHuecos({ pasadas: pasadas(SEIS_MARTES), libres: LIBRES_CENTRAL, hoy }),
      ).toThrow(/hoy/);
    }
  });

  it('E15 · libres desordenados: en frío, los tres primeros por fecha y hora; no muta la entrada', () => {
    const libres = [
      bloque('2026-10-13', '12:00'),
      bloque('2026-10-06', '13:00'),
      bloque('2026-10-06', '09:00'),
      bloque('2026-10-07', '10:00'),
    ];
    const copia = libres.map((b) => ({ ...b }));
    const r = sugerirHuecos({ pasadas: [], libres, hoy: HOY });
    expect(claves(r)).toEqual(['2026-10-06T09:00', '2026-10-06T13:00', '2026-10-07T10:00']);
    expect(libres).toEqual(copia);
  });
});

describe('sugerirHuecos · H8 y H9 (normalización y moda sobre todas las pasadas)', () => {
  it('H8 · ocho pasadas en orden descendente: se ordena antes de recortar a las seis más recientes', () => {
    const r = sugerirHuecos({
      pasadas: [
        ...pasadas([...SEIS_MARTES].reverse()),
        pasada('2026-08-20', '10:00'),
        pasada('2026-08-13', '10:00'),
      ],
      libres: [bloque('2026-10-06')],
      hoy: HOY,
    });
    expect(r.sugerencias[0]).toEqual({
      fecha: '2026-10-06',
      horaLocal: '12:00',
      motivo: { tipo: 'comoLasUltimas', n: 6 },
    });
  });

  it('H8 · el comparador de las pasadas mira la hora: el corte cae en mitad de un día doble', () => {
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-09-08', '13:00'),
        pasada('2026-09-08', '12:00'),
        pasada('2026-09-15', '13:00'),
        pasada('2026-09-22', '13:00'),
        pasada('2026-09-22', '12:00'),
        pasada('2026-09-29', '12:00'),
        pasada('2026-09-29', '13:00'),
      ],
      libres: [bloque('2026-10-06', '12:00'), bloque('2026-10-06', '13:00')],
      hoy: HOY,
    });
    // Se descarta la de las 12:00 del 08-09: la hora habitual es 13:00 (4 frente a 2).
    expect(r.sugerencias[0].fecha).toBe('2026-10-06');
    expect(r.sugerencias[0].horaLocal).toBe('13:00');
  });

  it('H9 · el día habitual sale de todas las pasadas, no de un representante por fecha', () => {
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-09-07', '12:00'),
        pasada('2026-09-10', '12:00'),
        pasada('2026-09-10', '13:00'),
        pasada('2026-09-14', '12:00'),
        pasada('2026-09-17', '12:00'),
        pasada('2026-09-17', '13:00'),
      ],
      libres: [bloque('2026-10-08', '12:00'), bloque('2026-10-12', '12:00')],
      hoy: HOY,
    });
    // Jueves 4 frente a lunes 2: la tarjeta de día habitual es la del jueves.
    expect(r.modo).toBe('habitual');
    expect(r.sugerencias).toContainEqual({
      fecha: '2026-10-08',
      horaLocal: '12:00',
      motivo: { tipo: 'diaHabitual', diaSemana: 4, hora: '12:00' },
    });
  });

  it('H9 · la hora habitual sale de todas las pasadas, no de un representante por fecha', () => {
    const r = sugerirHuecos({
      pasadas: [
        pasada('2026-09-15', '12:00'),
        pasada('2026-09-15', '13:00'),
        pasada('2026-09-22', '12:00'),
        pasada('2026-09-22', '13:00'),
        pasada('2026-09-29', '13:00'),
      ],
      libres: [bloque('2026-10-06', '12:00'), bloque('2026-10-06', '13:00')],
      hoy: HOY,
    });
    expect(r.sugerencias[0].horaLocal).toBe('13:00');
  });
});
