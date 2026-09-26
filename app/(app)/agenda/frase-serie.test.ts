import { describe, expect, it } from 'vitest';

import type { PrevisualizacionSerie } from '@/lib/citas/previsualizar';

import { describirPrevisualizacion } from './frase-serie';

const ZONA = 'Europe/Madrid';

type Cita = PrevisualizacionSerie['citas'][number];

function cita(fechaNueva: string, parcial: Partial<Cita> = {}): Cita {
  return {
    citaId: `00000000-0000-4000-8000-${fechaNueva.replaceAll('-', '').padStart(12, '0')}`,
    fechaActual: fechaNueva,
    fechaNueva,
    horaLocal: '10:00',
    inicio: `${fechaNueva}T08:00:00.000Z`,
    fin: `${fechaNueva}T08:50:00.000Z`,
    clasificacion: 'normal',
    recortada: false,
    ...parcial,
  };
}

function previa(parcial: {
  regla?: Partial<PrevisualizacionSerie['regla']>;
  reglaAnterior?: Partial<PrevisualizacionSerie['reglaAnterior']>;
  citas?: Cita[];
}): PrevisualizacionSerie {
  const reglaAnterior = {
    periodicidad: 'semanal' as const,
    diaSemana: 2,
    horaLocal: '17:00',
    duracionMinutos: 50,
    zonaHoraria: ZONA,
    ...parcial.reglaAnterior,
  };
  return {
    serieId: '00000000-0000-4000-8000-00000000aaaa',
    desdeCitaId: '00000000-0000-4000-8000-00000000bbbb',
    fechaOrigen: '2026-09-29',
    fechaDestino: '2026-10-01',
    cambia: true,
    reglaAnterior,
    regla: {
      ...reglaAnterior,
      diaSemana: 4,
      horaLocal: '10:00',
      ordinal: null,
      ultimo: false,
      recorte: false,
      ...parcial.regla,
    },
    citas: parcial.citas ?? [cita('2026-10-01'), cita('2026-10-08'), cita('2026-10-15')],
  };
}

describe('describirPrevisualizacion', () => {
  it('semanal: el antes y el después con el día en plural, y el alcance con las fechas', () => {
    const d = describirPrevisualizacion(previa({}));
    expect(d.ahora).toBe('Ahora: los martes a las 17:00.');
    expect(d.despues).toBe('Esta y las siguientes pasarán a ser los jueves a las 10:00.');
    expect(d.alcance).toBe('Afecta a 3 citas, del 1 de octubre al 15 de octubre.');
    expect(d.avisos).toEqual([]);
  });

  it('una sola cita: el singular, sin concatenar', () => {
    const d = describirPrevisualizacion(previa({ citas: [cita('2026-10-01')] }));
    expect(d.alcance).toBe('Afecta a 1 cita, la del 1 de octubre.');
  });

  it('el plural del sábado y el domingo sale del catálogo', () => {
    const d = describirPrevisualizacion(previa({ regla: { diaSemana: 6 }, reglaAnterior: { diaSemana: 7 } }));
    expect(d.ahora).toBe('Ahora: los domingos a las 17:00.');
    expect(d.despues).toBe('Esta y las siguientes pasarán a ser los sábados a las 10:00.');
  });

  it('quincenal', () => {
    const d = describirPrevisualizacion(
      previa({ reglaAnterior: { periodicidad: 'quincenal' }, regla: { periodicidad: 'quincenal' } }),
    );
    expect(d.despues).toBe('Esta y las siguientes pasarán a ser los jueves, cada dos semanas, a las 10:00.');
  });

  it('mensual con el ordinal que trae la base: el 3.er jueves', () => {
    const d = describirPrevisualizacion(
      previa({ reglaAnterior: { periodicidad: 'mensual' }, regla: { periodicidad: 'mensual', ordinal: 3 } }),
    );
    expect(d.despues).toBe('Esta y las siguientes pasarán a ser el 3.er jueves de cada mes a las 10:00.');
    // La regla anterior no trae ordinal: no se inventa (ADR-070 lo lee la base, no la interfaz).
    expect(d.ahora).toBe('Ahora: un martes de cada mes a las 17:00.');
  });

  it('ordinal 5 con «último» y recorte: la frase dice «el último» y el aviso da las fechas recortadas', () => {
    const d = describirPrevisualizacion(
      previa({
        regla: { periodicidad: 'mensual', ordinal: 5, ultimo: true, recorte: true },
        citas: [
          cita('2026-10-29'),
          cita('2026-11-26', { recortada: true }),
          cita('2026-12-31'),
          cita('2027-01-28', { recortada: true }),
        ],
      }),
    );
    expect(d.despues).toBe('Esta y las siguientes pasarán a ser el último jueves de cada mes a las 10:00.');
    expect(d.avisos).toEqual([
      'Hay meses sin 5.º jueves. En ellos la cita irá al último, el 4.º: 26 de noviembre y 28 de enero.',
    ]);
  });

  it('hora inexistente: la fecha, la hora de la regla y la hora real que da la base', () => {
    const d = describirPrevisualizacion(
      previa({
        regla: { horaLocal: '02:30', diaSemana: 7 },
        citas: [
          cita('2027-03-21'),
          cita('2027-03-28', { clasificacion: 'inexistente', inicio: '2027-03-28T01:30:00.000Z' }),
        ],
      }),
    );
    expect(d.avisos).toEqual([
      'El 28 de marzo las 02:30 no existen por el cambio de hora: esa cita irá a las 03:30 y quedará marcada al confirmarla.',
    ]);
  });

  it('hora ambigua', () => {
    const d = describirPrevisualizacion(
      previa({
        regla: { horaLocal: '02:30', diaSemana: 7 },
        citas: [cita('2026-10-25', { clasificacion: 'ambigua', inicio: '2026-10-25T00:30:00.000Z' })],
      }),
    );
    expect(d.avisos).toEqual([
      'El 25 de octubre las 02:30 se repiten por el cambio de hora: esa cita irá a la primera y quedará marcada al confirmarla.',
    ]);
  });

  it('citas sin hora: 1 y n, por el plural del catálogo', () => {
    const una = describirPrevisualizacion(previa({ citas: [cita('2026-10-01'), cita('2026-10-08', { inicio: null, fin: null })] }));
    expect(una.avisos).toEqual(['1 cita quedará sin hora y se decidirá a mano en «Por confirmar».']);
    const dos = describirPrevisualizacion(
      previa({
        citas: [cita('2026-10-01', { inicio: null, fin: null }), cita('2026-10-08', { inicio: null, fin: null })],
      }),
    );
    expect(dos.avisos).toEqual(['2 citas quedarán sin hora y se decidirán a mano en «Por confirmar».']);
  });

  it('las fechas se leen de la base, no de un cálculo: una fecha que no cuadra con el día sale tal cual', () => {
    // Si la frase recalculara el día de la semana o la fecha, esto no saldría así.
    const d = describirPrevisualizacion(previa({ citas: [cita('2026-10-02'), cita('2026-10-03')] }));
    expect(d.alcance).toBe('Afecta a 2 citas, del 2 de octubre al 3 de octubre.');
  });
});
