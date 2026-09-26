import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FilaAgenda } from '@/lib/citas/agenda';
import type { PropuestaPendiente } from '@/lib/citas/propuestas';

import { construirVista, type EntradaVista } from './vista';

// «Notas» está apagada hasta T-012 (D8). Para probar la condición que la acompaña (ser el
// profesional de la cita) hay que poder encenderla aquí.
const ruta = vi.hoisted(() => ({ disponible: false }));
vi.mock('./notas', async (original) => ({
  ...(await original<typeof import('./notas')>()),
  get RUTA_NOTAS_DISPONIBLE() {
    return ruta.disponible;
  },
}));

const ZONA = 'Europe/Madrid';
const YO = '00000000-0000-4000-8000-000000000001';
const OTRA = '00000000-0000-4000-8000-000000000002';

function fila(parcial: Partial<FilaAgenda> & Pick<FilaAgenda, 'id' | 'inicio' | 'fin'>): FilaAgenda {
  return {
    pacienteId: 'aaaaaaaa-0000-4000-8000-000000000001',
    profesionalId: YO,
    centroId: 'cccccccc-0000-4000-8000-000000000001',
    serieId: null,
    zonaHoraria: ZONA,
    estado: 'programada',
    sala: null,
    desviada: false,
    motivoDesviacion: null,
    tipoTerapiaNombre: 'Individual',
    notaOperativa: null,
    pacienteNombre: 'Ana',
    pacienteApellidos: 'García López',
    profesionalNombre: 'Laura Martín',
    centroNombre: 'Centro',
    enCurso: false,
    reprogramable: true,
    notaPendiente: false,
    ...parcial,
  };
}

function entrada(parcial: Partial<EntradaVista>): EntradaVista {
  return {
    filas: [],
    propuestas: [],
    vista: 'semana',
    fecha: '2026-09-24',
    zona: ZONA,
    hoy: '2026-09-24',
    ahora: new Date('2026-09-24T10:00:00Z'),
    usuarioId: YO,
    profesionalFiltrado: null,
    ...parcial,
  };
}

beforeEach(() => {
  ruta.disponible = false;
});

describe('construirVista · la semana', () => {
  it('siete días de lunes a domingo, título, anterior y siguiente', () => {
    const v = construirVista(entrada({}));
    expect(v.dias.map((d) => d.fecha)).toEqual([
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27',
    ]);
    expect(v.titulo).toBe('21–27 de septiembre de 2026');
    expect(v.anterior).toBe('2026-09-17');
    expect(v.siguiente).toBe('2026-10-01');
    expect(v.fechaFoco).toBe('2026-09-24');
    expect(v.dias[3]).toMatchObject({ numero: '24', etiquetaCorta: 'jue', esHoy: true, delMes: true });
    expect(v.dias[3].etiquetaLarga).toBe('jueves, 24 de septiembre de 2026');
  });

  it('una semana entre dos meses y entre dos años lo dice en el título', () => {
    expect(construirVista(entrada({ fecha: '2026-09-30' })).titulo).toBe(
      '28 de septiembre – 4 de octubre de 2026',
    );
    expect(construirVista(entrada({ fecha: '2026-12-31' })).titulo).toBe(
      '28 de diciembre de 2026 – 3 de enero de 2027',
    );
  });

  it('eje de 07:00 a 21:00 sin citas, ampliado a la hora entera fuera de él', () => {
    expect(construirVista(entrada({})).eje).toEqual({
      desdeMinuto: 420,
      hastaMinuto: 1260,
      horas: ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'],
    });
    const v = construirVista(
      entrada({
        filas: [
          fila({ id: 'a', inicio: new Date('2026-09-22T04:30:00Z'), fin: new Date('2026-09-22T05:20:00Z') }), // 06:30
          fila({ id: 'b', inicio: new Date('2026-09-23T19:10:00Z'), fin: new Date('2026-09-23T20:00:00Z') }), // 21:10-22:00
        ],
      }),
    );
    expect(v.eje.desdeMinuto).toBe(360);
    expect(v.eje.hastaMinuto).toBe(1320);
    expect(v.eje.horas[0]).toBe('06:00');
    expect(v.eje.horas.at(-1)).toBe('21:00');
  });

  it('D5: el domingo del cambio de hora de marzo, una cita a las 10:00 cae en el minuto 600', () => {
    const v = construirVista(
      entrada({
        fecha: '2026-03-26',
        hoy: '2026-03-26',
        filas: [fila({ id: 'd', inicio: new Date('2026-03-29T08:00:00Z'), fin: new Date('2026-03-29T08:50:00Z') })],
      }),
    );
    expect(v.citas).toHaveLength(1);
    expect(v.citas[0]).toMatchObject({ diaIndice: 6, minutoPared: 600, duracionMinutos: 50, horaLocal: '10:00' });
    expect(v.citas[0].fechaLocal).toBe('2026-03-29');
  });

  it('una cita que cruza la medianoche da dos tramos; el segundo empieza en el minuto 0', () => {
    const v = construirVista(
      entrada({
        filas: [fila({ id: 'n', inicio: new Date('2026-09-22T21:30:00Z'), fin: new Date('2026-09-22T22:30:00Z') })],
      }),
    );
    expect(v.citas.map((c) => [c.tramo, c.diaIndice, c.minutoPared, c.duracionMinutos])).toEqual([
      [0, 1, 1410, 30],
      [1, 2, 0, 30],
    ]);
    // Los dos tramos son la misma cita: la misma hora de inicio para el diálogo.
    expect(v.citas.every((c) => c.fechaLocal === '2026-09-22' && c.horaLocal === '23:30')).toBe(true);
  });

  it('rango, duración, nombre corto y la fila entera en cadenas (ningún Date cruza al cliente)', () => {
    const v = construirVista(
      entrada({
        filas: [fila({ id: 'r', inicio: new Date('2026-09-24T08:00:00Z'), fin: new Date('2026-09-24T08:50:00Z') })],
      }),
    );
    expect(v.citas[0]).toMatchObject({
      rango: '10:00 – 10:50',
      duracion: '50 min',
      nombrePaciente: 'Ana García López',
      nombreCorto: 'Ana G.',
      profesionalNombre: 'Laura Martín',
      tipoNombre: 'Individual',
    });
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('sin nombre del paciente (la RLS no lo deja ver), «Paciente» en los dos campos', () => {
    const v = construirVista(
      entrada({
        filas: [
          fila({
            id: 'x',
            inicio: new Date('2026-09-24T08:00:00Z'),
            fin: new Date('2026-09-24T08:50:00Z'),
            pacienteNombre: null,
            pacienteApellidos: null,
          }),
        ],
      }),
    );
    expect(v.citas[0].nombrePaciente).toBe('Paciente');
    expect(v.citas[0].nombreCorto).toBe('Paciente');
  });

  it('sin nombre del profesional, «Profesional» en la cita y en el filtro', () => {
    const v = construirVista(
      entrada({
        filas: [
          fila({
            id: 'x',
            inicio: new Date('2026-09-24T08:00:00Z'),
            fin: new Date('2026-09-24T08:50:00Z'),
            profesionalNombre: null,
          }),
        ],
      }),
    );
    expect(v.citas[0].profesionalNombre).toBe('Profesional');
    expect(v.profesionales.map((p) => p.nombre)).toEqual(['Profesional']);
  });
});

describe('construirVista · el latido', () => {
  it('con dos en curso, solo late la primera por (inicio, id); la otra sigue «en curso»', () => {
    const v = construirVista(
      entrada({
        filas: [
          fila({ id: 'b', inicio: new Date('2026-09-24T08:00:00Z'), fin: new Date('2026-09-24T09:00:00Z'), enCurso: true }),
          fila({ id: 'a', inicio: new Date('2026-09-24T08:00:00Z'), fin: new Date('2026-09-24T09:00:00Z'), enCurso: true, profesionalId: OTRA }),
          fila({ id: '0', inicio: new Date('2026-09-24T07:00:00Z'), fin: new Date('2026-09-24T07:50:00Z') }),
        ],
      }),
    );
    const late = v.citas.filter((c) => c.late);
    expect(late.map((c) => c.id)).toEqual(['a']);
    expect(v.citas.filter((c) => c.estado === 'en_curso').map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('el latido se decide después de filtrar por profesional', () => {
    const v = construirVista(
      entrada({
        profesionalFiltrado: YO,
        filas: [
          fila({ id: 'b', inicio: new Date('2026-09-24T08:00:00Z'), fin: new Date('2026-09-24T09:00:00Z'), enCurso: true }),
          fila({ id: 'a', inicio: new Date('2026-09-24T08:00:00Z'), fin: new Date('2026-09-24T09:00:00Z'), enCurso: true, profesionalId: OTRA }),
        ],
      }),
    );
    expect(v.citas.map((c) => [c.id, c.late])).toEqual([['b', true]]);
  });
});

describe('construirVista · notas y aviso (D8, M7)', () => {
  const ayer = { inicio: new Date('2026-09-23T08:00:00Z'), fin: new Date('2026-09-23T08:50:00Z') };

  it('cita de ayer realizada y con nota pendiente, de la usuaria: pendiente desde hace 1 día', () => {
    const v = construirVista(entrada({ filas: [fila({ id: 'y', ...ayer, estado: 'realizada', notaPendiente: true })] }));
    expect(v.citas[0].notas.diasPendiente).toBe(1);
    expect(v.citas[0].notas.href).toBe('/pacientes/aaaaaaaa-0000-4000-8000-000000000001/historia/notas?cita=y');
  });

  it('la de otro profesional no lleva aviso ni «Notas», aunque la base diga que falta', () => {
    ruta.disponible = true;
    const v = construirVista(
      entrada({ filas: [fila({ id: 'o', ...ayer, estado: 'realizada', notaPendiente: true, profesionalId: OTRA })] }),
    );
    expect(v.citas[0].notas).toMatchObject({ mostrar: false, diasPendiente: null });
  });

  it('con la ruta encendida, «Notas» solo en las propias y no canceladas ni sin asistencia', () => {
    ruta.disponible = true;
    const v = construirVista(
      entrada({
        filas: [
          fila({ id: '1', ...ayer, estado: 'realizada' }),
          fila({ id: '2', ...ayer, estado: 'cancelada' }),
          fila({ id: '3', ...ayer, estado: 'no_asistida' }),
          fila({ id: '4', ...ayer, estado: 'realizada', profesionalId: OTRA }),
        ],
      }),
    );
    expect(Object.fromEntries(v.citas.map((c) => [c.id, c.notas.mostrar]))).toEqual({
      '1': true,
      '2': false,
      '3': false,
      '4': false,
    });
  });

  it('con la ruta apagada no se muestra nunca, pero el aviso sí', () => {
    const v = construirVista(entrada({ filas: [fila({ id: 'y', ...ayer, estado: 'realizada', notaPendiente: true })] }));
    expect(v.citas[0].notas.mostrar).toBe(false);
    expect(v.citas[0].notas.diasPendiente).toBe(1);
  });

  it('«Notas» es el botón principal en la cita en curso', () => {
    ruta.disponible = true;
    const v = construirVista(
      entrada({ filas: [fila({ id: 'c', inicio: new Date('2026-09-24T09:30:00Z'), fin: new Date('2026-09-24T10:20:00Z'), enCurso: true })] }),
    );
    expect(v.citas[0].notas).toMatchObject({ mostrar: true, primario: true });
  });
});

describe('construirVista · serie, propuesta, color y filtro', () => {
  const base = { inicio: new Date('2026-09-25T08:00:00Z'), fin: new Date('2026-09-25T08:50:00Z') };
  const SERIE = 'eeeeeeee-0000-4000-8000-000000000001';

  it('«esta y las siguientes» solo en una cita de serie, no desviada y reprogramable', () => {
    const v = construirVista(
      entrada({
        filas: [
          fila({ id: '1', ...base, serieId: SERIE }),
          fila({ id: '2', ...base, serieId: SERIE, desviada: true, motivoDesviacion: 'reprogramada' }),
          fila({ id: '3', ...base, serieId: SERIE, reprogramable: false }),
          fila({ id: '4', ...base }),
        ],
      }),
    );
    const por = Object.fromEntries(v.citas.map((c) => [c.id, c]));
    expect(por['1']).toMatchObject({ deSerie: true, alcanceSiguientesPermitido: true });
    expect(por['2']).toMatchObject({ desviada: true, motivoDesviacion: 'Movida a mano', alcanceSiguientesPermitido: false });
    expect(por['3'].alcanceSiguientesPermitido).toBe(false);
    expect(por['4']).toMatchObject({ deSerie: false, alcanceSiguientesPermitido: false });
  });

  it('la propuesta pendiente de la cita se engancha con su rango', () => {
    const propuesta: PropuestaPendiente = {
      id: 'p1',
      serieId: SERIE,
      citaId: '1',
      pacienteId: 'aaaaaaaa-0000-4000-8000-000000000001',
      profesionalId: YO,
      centroId: null,
      motivo: 'festivo',
      fechaPrevista: '2026-09-25',
      horaLocalPrevista: '10:00:00',
      inicioPropuesto: '2026-09-25T10:00:00Z',
      finPropuesto: '2026-09-25T10:50:00Z',
      zonaHoraria: ZONA,
    };
    const v = construirVista(
      entrada({ filas: [fila({ id: '1', ...base, serieId: SERIE }), fila({ id: '2', ...base })], propuestas: [propuesta] }),
    );
    const por = Object.fromEntries(v.citas.map((c) => [c.id, c]));
    expect(por['1'].propuestaPendiente).toEqual({ id: 'p1', rango: '12:00 – 12:50' });
    expect(por['2'].propuestaPendiente).toBeNull();
  });

  it('el color del profesional es estable y está entre 1 y 6', () => {
    const v = construirVista(
      entrada({ filas: [fila({ id: '1', ...base }), fila({ id: '2', ...base }), fila({ id: '3', ...base, profesionalId: OTRA })] }),
    );
    const colores = v.citas.map((c) => c.colorProfesional);
    expect(colores[0]).toBe(colores[1]);
    for (const color of colores) expect([1, 2, 3, 4, 5, 6]).toContain(color);
  });

  it('el filtro por profesional quita citas, pero las opciones del filtro siguen siendo todas', () => {
    const v = construirVista(
      entrada({
        profesionalFiltrado: OTRA,
        filas: [fila({ id: '1', ...base }), fila({ id: '2', ...base, profesionalId: OTRA, profesionalNombre: 'Bea Ruiz' })],
      }),
    );
    expect(v.citas.map((c) => c.id)).toEqual(['2']);
    expect(v.profesionales).toEqual([
      { id: OTRA, nombre: 'Bea Ruiz' },
      { id: YO, nombre: 'Laura Martín' },
    ]);
    // Con el filtro, la cita que queda ya no comparte grupo con la quitada.
    expect(v.citas[0].columnasEnGrupo).toBe(1);
  });
});

describe('construirVista · el mes', () => {
  it('42 días, título con mayúscula, anterior y siguiente por meses', () => {
    const v = construirVista(entrada({ vista: 'mes' }));
    expect(v.dias).toHaveLength(42);
    expect(v.dias[0].fecha).toBe('2026-08-31');
    expect(v.dias[0].delMes).toBe(false);
    expect(v.titulo).toBe('Septiembre de 2026');
    expect(v.anterior).toBe('2026-08-24');
    expect(v.siguiente).toBe('2026-10-24');
  });

  it('una cita por fila, en el índice de su día de los 42', () => {
    const v = construirVista(
      entrada({
        vista: 'mes',
        filas: [
          fila({ id: 'm', inicio: new Date('2026-10-01T08:00:00Z'), fin: new Date('2026-10-01T08:50:00Z') }),
          fila({ id: 'fuera', inicio: new Date('2026-11-20T08:00:00Z'), fin: new Date('2026-11-20T08:50:00Z') }),
        ],
      }),
    );
    expect(v.citas.map((c) => [c.id, c.diaIndice, c.fechaLocal, c.tramo])).toEqual([['m', 31, '2026-10-01', 0]]);
  });
});
