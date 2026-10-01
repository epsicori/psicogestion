import { describe, expect, it } from 'vitest';

import type { FilaAgenda } from '@/lib/citas/agenda';

import {
  diasPendiente,
  esCambioDeHora,
  filtrarPorCentro,
  hoyEn,
  metricasDelMes,
  leerRol,
  nivelDeAntiguedad,
  puedeVerCuadro,
  rangoDeProximas,
  resolverCentro,
  rangoDeVista,
  rangoDelMes,
  seleccionarProximas,
} from './bloques';

const ZONA = 'Europe/Madrid';

function fila(parcial: Partial<FilaAgenda>): FilaAgenda {
  return {
    id: 'c',
    pacienteId: 'p',
    profesionalId: 'pro',
    centroId: 'A',
    serieId: null,
    inicio: new Date('2026-09-24T08:00:00Z'),
    fin: new Date('2026-09-24T08:50:00Z'),
    zonaHoraria: ZONA,
    estado: 'programada',
    sala: null,
    desviada: false,
    motivoDesviacion: null,
    tipoTerapiaNombre: null,
    notaOperativa: null,
    pacienteNombre: 'Ana',
    pacienteApellidos: 'García',
    profesionalNombre: 'Laura',
    centroNombre: 'Centro A',
    enCurso: false,
    reprogramable: true,
    notaPendiente: false,
    ...parcial,
  };
}

describe('hoyEn', () => {
  it('es el día de pared en la zona, no en UTC', () => {
    // 23:30 UTC del 26 es ya el 27 en Madrid (UTC+2).
    expect(hoyEn(new Date('2026-09-26T23:30:00Z'), ZONA)).toBe('2026-09-27');
    expect(hoyEn(new Date('2026-09-26T23:30:00Z'), 'UTC')).toBe('2026-09-26');
  });
});

describe('rangos', () => {
  it('semana: de lunes 00:00 a lunes 00:00 locales, también la del cambio de hora (169 h)', () => {
    // La hora cambia el domingo 25 de octubre de 2026: la semana del 28 ya es toda en CET (UTC+1).
    const { desde, hasta } = rangoDeVista('semana', '2026-10-28', ZONA);
    expect(desde.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(hasta.toISOString()).toBe('2026-11-01T23:00:00.000Z');
    // La del 22 empieza en CEST (UTC+2) y acaba en CET: 169 h.
    const cambio = rangoDeVista('semana', '2026-10-22', ZONA);
    expect(cambio.desde.toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect((cambio.hasta.getTime() - cambio.desde.getTime()) / 3_600_000).toBe(169);
  });

  it('mes: de la medianoche del primero de los 42 días a la del día siguiente al último', () => {
    const { desde, hasta } = rangoDeVista('mes', '2026-09-15', ZONA);
    // Septiembre de 2026 empieza en martes: la rejilla arranca el lunes 31 de agosto.
    expect(desde.toISOString()).toBe('2026-08-30T22:00:00.000Z');
    // 42 días: del 31-08 al 11-10, y el límite es la medianoche del 12-10.
    expect(hasta.toISOString()).toBe('2026-10-11T22:00:00.000Z');
  });

  it('próximas: desde ahora hasta el final de mañana en la zona', () => {
    const ahora = new Date('2026-09-26T10:00:00Z');
    const { desde, hasta } = rangoDeProximas(ahora, '2026-09-26', ZONA);
    expect(desde).toBe(ahora);
    expect(hasta.toISOString()).toBe('2026-09-27T22:00:00.000Z');
  });

  it('cuadro: desde el día 1 del mes en la zona hasta ahora', () => {
    const ahora = new Date('2026-10-01T00:30:00Z');
    // En Madrid ya es 1 de octubre: el mes empieza a las 22:00 UTC del 30 de septiembre.
    const { desde, hasta } = rangoDelMes(ahora, hoyEn(ahora, ZONA), ZONA);
    expect(desde.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(hasta).toBe(ahora);
  });
});

describe('filtrarPorCentro', () => {
  it('con centro, solo las suyas; sin centro («todos»), todas', () => {
    const filas = [fila({ id: '1', centroId: 'A' }), fila({ id: '2', centroId: 'B' }), fila({ id: '3', centroId: null })];
    expect(filtrarPorCentro(filas, 'A').map((f) => f.id)).toEqual(['1']);
    expect(filtrarPorCentro(filas, null).map((f) => f.id)).toEqual(['1', '2', '3']);
  });
});

describe('seleccionarProximas', () => {
  const ahora = new Date('2026-09-26T10:00:00Z');

  it('solo las que empiezan después de ahora, programadas o confirmadas, en orden y las 5 primeras', () => {
    const filas = [
      fila({ id: 'empezada', inicio: new Date('2026-09-26T09:30:00Z'), enCurso: true }),
      fila({ id: 'justo-ahora', inicio: ahora }),
      fila({ id: 'cancelada', inicio: new Date('2026-09-26T11:00:00Z'), estado: 'cancelada' }),
      fila({ id: 'realizada', inicio: new Date('2026-09-26T11:00:00Z'), estado: 'realizada' }),
      ...['7', '3', '5', '1', '2', '6', '4'].map((h) =>
        fila({ id: `h${h}`, inicio: new Date(`2026-09-26T1${h}:00:00Z`), estado: h === '3' ? 'confirmada' : 'programada' }),
      ),
    ];
    expect(seleccionarProximas(filas, ahora).map((f) => f.id)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5']);
  });

  it('a igual inicio, desempata por id: el orden no depende de la base', () => {
    const inicio = new Date('2026-09-26T12:00:00Z');
    const filas = [fila({ id: 'b', inicio }), fila({ id: 'a', inicio })];
    expect(seleccionarProximas(filas, ahora).map((f) => f.id)).toEqual(['a', 'b']);
  });
});

describe('metricasDelMes', () => {
  it('asistencia y ausencia sobre realizadas + no asistidas; el resto no cuenta', () => {
    const filas = [
      ...Array.from({ length: 3 }, (_, i) => fila({ id: `r${i}`, estado: 'realizada' })),
      fila({ id: 'n', estado: 'no_asistida' }),
      fila({ id: 'c', estado: 'cancelada' }),
      fila({ id: 'p', estado: 'programada' }),
    ];
    expect(metricasDelMes(filas)).toEqual({ asistencia: 75, ausencia: 25, cerradas: 4 });
  });

  it('sin denominador no hay porcentaje: null, que se pinta «—»', () => {
    expect(metricasDelMes([fila({ estado: 'cancelada' })])).toEqual({ asistencia: null, ausencia: null, cerradas: 0 });
  });

  it('redondea al entero: 2 de 3 es 67 y 1 de 3 es 33', () => {
    const filas = [fila({ estado: 'realizada' }), fila({ estado: 'realizada' }), fila({ estado: 'no_asistida' })];
    expect(metricasDelMes(filas)).toMatchObject({ asistencia: 67, ausencia: 33 });
  });
});

describe('antigüedad de la documentación pendiente', () => {
  it('días de calendario desde la fecha de referencia hasta hoy en la zona; sin fecha, null', () => {
    expect(diasPendiente('2026-09-20', '2026-09-26')).toBe(6);
    expect(diasPendiente(null, '2026-09-26')).toBeNull();
  });

  it('0 días sin píldora; 1 y 2, «más de 24 h»; 3 o más, «más de 72 h»', () => {
    expect(nivelDeAntiguedad(null)).toBeNull();
    expect(nivelDeAntiguedad(0)).toBeNull();
    expect(nivelDeAntiguedad(1)).toBe('mas24');
    expect(nivelDeAntiguedad(2)).toBe('mas24');
    expect(nivelDeAntiguedad(3)).toBe('mas72');
    expect(nivelDeAntiguedad(40)).toBe('mas72');
  });
});

describe('resolverCentro', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const X = '33333333-3333-4333-8333-333333333333';
  const ofrecidos = [A, B];

  it('manda el parámetro si es un centro ofrecido; si no, la cookie si lo es; si no, todos', () => {
    expect(resolverCentro(A, B, ofrecidos)).toBe(A);
    expect(resolverCentro(null, B, ofrecidos)).toBe(B);
    expect(resolverCentro(X, B, ofrecidos)).toBe(B);
    expect(resolverCentro(null, X, ofrecidos)).toBeNull();
    expect(resolverCentro(null, undefined, ofrecidos)).toBeNull();
  });

  it('«todos» en la URL gana a la cookie: si no, no se podría volver a ver todo', () => {
    expect(resolverCentro('todos', B, ofrecidos)).toBeNull();
  });

  it('un centro que no se ofrece no se filtra nunca, venga de donde venga', () => {
    expect(resolverCentro(X, X, [])).toBeNull();
  });
});

describe('rol', () => {
  it('lista blanca: lo que no es uno de los tres roles es null', () => {
    expect(leerRol('administrador')).toBe('administrador');
    expect(leerRol('profesional_sanitario')).toBe('profesional_sanitario');
    expect(leerRol('tecnico_administrativo')).toBe('tecnico_administrativo');
    expect(leerRol('otro')).toBeNull();
    expect(leerRol(null)).toBeNull();
    expect(leerRol(undefined)).toBeNull();
  });

  it('el cuadro, solo administrador y profesional sanitario (fallo cerrado)', () => {
    expect(puedeVerCuadro('administrador')).toBe(true);
    expect(puedeVerCuadro('profesional_sanitario')).toBe(true);
    expect(puedeVerCuadro('tecnico_administrativo')).toBe(false);
    expect(puedeVerCuadro(null)).toBe(false);
  });
});

describe('esCambioDeHora', () => {
  it('una hora corriente no lo es', () => {
    expect(esCambioDeHora('2026-10-01T08:00:00Z', ZONA)).toBe(false);
  });

  it('el salto de marzo y el solape de octubre sí, medidos con la hora local del instante', () => {
    // 2026-10-25 02:30 local ocurre dos veces (ambigua); el instante 00:30Z es su primera vez.
    expect(esCambioDeHora('2026-10-25T00:30:00Z', ZONA)).toBe(true);
    // Una hora después del solape ya es normal.
    expect(esCambioDeHora('2026-10-25T03:30:00Z', ZONA)).toBe(false);
  });

  it('sin propuesta no hay cambio de hora', () => {
    expect(esCambioDeHora(null, ZONA)).toBe(false);
  });
});
