import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firmarPrevisualizacion, type PrevisualizacionSerie } from './previsualizar';
import { evaluarModificarSerie, prepararMovimiento, reprogramarCita, ubicarEnSerie } from './reprogramar';
import type { Sesion } from './tipos';

/**
 * Doble del cliente de Supabase que ejecuta el código real de `series.ts`,
 * `propuestas.ts`, `citas.ts` y `previsualizar.ts`: solo se falsifica la
 * respuesta de cada RPC y tabla. Cada llamada queda registrada, para poder
 * afirmar qué se escribió y qué NO (M9c).
 */
type Respuesta = { data: unknown; error: unknown };

function consulta(respuesta: Respuesta) {
  const cadena: Record<string, unknown> = {};
  for (const metodo of ['select', 'eq', 'in', 'order']) cadena[metodo] = vi.fn(() => cadena);
  cadena.maybeSingle = () => Promise.resolve(respuesta);
  cadena.then = (resolver: (r: Respuesta) => unknown) => Promise.resolve(respuesta).then(resolver);
  return cadena;
}

function sesionFalsa(tablas: Record<string, Respuesta>, rpc: Record<string, Respuesta>) {
  const from = vi.fn((tabla: string) => consulta(tablas[tabla] ?? { data: null, error: null }));
  const llamadaRpc = vi.fn<(nombre: string, argumentos?: unknown) => Promise<Respuesta>>((nombre) =>
    Promise.resolve(rpc[nombre] ?? { data: null, error: null }));
  const sesion = {
    supabase: { from, rpc: llamadaRpc } as unknown as Sesion['supabase'],
    usuario: { id: 'u1' } as unknown as Sesion['usuario'],
  };
  const llamadas = (nombre: string) => llamadaRpc.mock.calls.filter(([n]) => n === nombre);
  return { sesion, rpc: llamadaRpc, llamadas };
}

const CITA_ID = '11111111-1111-4111-8111-111111111111';
const SERIE_ID = '22222222-2222-4222-8222-222222222222';
const OTRA_CITA = '33333333-3333-4333-8333-333333333333';
const PROPUESTA_ANCLA = '44444444-4444-4444-8444-444444444444';
const PROPUESTA_OTRA = '55555555-5555-4555-8555-555555555555';
const PROPUESTA_AJENA = '66666666-6666-4666-8666-666666666666';

// Jueves 1-10-2026, 10:00–10:50 en Madrid (UTC+2).
const FILA_CITA = {
  id: CITA_ID,
  inicio: '2026-10-01T08:00:00+00:00',
  fin: '2026-10-01T08:50:00+00:00',
  serie_id: SERIE_ID,
  desviada: false,
  centro_id: 'ce1',
  zona_horaria: 'Europe/Madrid',
  estado: 'programada',
};
const SUELTA = { ...FILA_CITA, serie_id: null };
const AHORA = new Date('2026-09-26T10:00:00Z');

// Destino: jueves 8-10-2026 a las 11:00 de Madrid = 09:00Z.
const DESTINO = { citaId: CITA_ID, fecha: '2026-10-08', hora: '11:00', zona: 'Europe/Madrid' };
const INICIO_DESTINO = '2026-10-08T09:00:00.000Z';

/** Lo que devolvería `agenda_previsualizar_edicion_serie` para DESTINO. */
function previaBd(cambios: Record<string, unknown> = {}, ancla: Record<string, unknown> = {}) {
  return {
    serie_id: SERIE_ID,
    desde_cita_id: CITA_ID,
    fecha_origen: '2026-10-01',
    fecha_destino: '2026-10-08',
    cambia: true,
    regla_anterior: {
      periodicidad: 'semanal',
      dia_semana: 4,
      hora_local: '10:00:00',
      duracion_minutos: 50,
      zona_horaria: 'Europe/Madrid',
    },
    regla: {
      periodicidad: 'semanal',
      dia_semana: 4,
      hora_local: '11:00:00',
      duracion_minutos: 50,
      zona_horaria: 'Europe/Madrid',
      ordinal: null,
      ultimo: false,
      recorte: false,
    },
    citas: [
      {
        cita_id: CITA_ID,
        fecha_actual: '2026-10-01',
        fecha_nueva: '2026-10-08',
        hora_local: '11:00:00',
        inicio: '2026-10-08T11:00:00+02:00',
        fin: '2026-10-08T11:50:00+02:00',
        clasificacion: 'normal',
        recortada: false,
        ...ancla,
      },
      {
        cita_id: OTRA_CITA,
        fecha_actual: '2026-10-08',
        fecha_nueva: '2026-10-15',
        hora_local: '11:00:00',
        inicio: '2026-10-15T11:00:00+02:00',
        fin: '2026-10-15T11:50:00+02:00',
        clasificacion: 'normal',
        recortada: false,
      },
    ],
    ...cambios,
  };
}

function propuestaBd(id: string, citaId: string | null, inicio: string | null) {
  return {
    id,
    serie_id: SERIE_ID,
    cita_id: citaId,
    paciente_id: 'p1',
    profesional_id: 'pr1',
    centro_id: 'ce1',
    motivo: 'regla_cambiada',
    fecha_prevista: '2026-10-08',
    hora_local_prevista: '11:00:00',
    inicio_propuesto: inicio,
    fin_propuesto: null,
    zona_horaria: 'Europe/Madrid',
  };
}

/** La firma que el cliente obtuvo al previsualizar la misma respuesta. */
async function firmaDe(previa: ReturnType<typeof previaBd>) {
  const { sesion } = sesionFalsa({}, { agenda_previsualizar_edicion_serie: { data: previa, error: null } });
  const { previsualizarEdicionSerie } = await import('./previsualizar');
  const r = await previsualizarEdicionSerie(sesion, { citaId: CITA_ID, fecha: '2026-10-08', horaLocal: '11:00' });
  if (!r.ok) throw new Error('la previsualización de la prueba no parsea');
  return r.firma;
}

function escenarioSerie(opciones: {
  cita?: Record<string, unknown>;
  previa?: ReturnType<typeof previaBd>;
  editar?: Respuesta;
  propuestas?: Respuesta;
  confirmar?: Respuesta;
} = {}) {
  return sesionFalsa(
    {
      citas: { data: opciones.cita ?? FILA_CITA, error: null },
      propuestas_cita: opciones.propuestas ?? {
        data: [
          propuestaBd(PROPUESTA_AJENA, CITA_ID, INICIO_DESTINO),
          propuestaBd(PROPUESTA_ANCLA, CITA_ID, INICIO_DESTINO),
          propuestaBd(PROPUESTA_OTRA, OTRA_CITA, '2026-10-15T09:00:00.000Z'),
        ],
        error: null,
      },
    },
    {
      zona_horaria_centro: { data: 'Europe/Madrid', error: null },
      agenda_previsualizar_edicion_serie: { data: opciones.previa ?? previaBd(), error: null },
      agenda_editar_serie: opciones.editar ?? {
        data: { alcance: 'esta_y_siguientes', serie_id: SERIE_ID, propuestas: [PROPUESTA_ANCLA, PROPUESTA_OTRA] },
        error: null,
      },
      agenda_confirmar_propuesta: opciones.confirmar ?? { data: CITA_ID, error: null },
      agenda_actualizar_cita: { data: CITA_ID, error: null },
    },
  );
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('prepararMovimiento (§5)', () => {
  function conCita(fila: Record<string, unknown>, zona = 'Europe/Madrid') {
    return sesionFalsa({ citas: { data: fila, error: null } }, { zona_horaria_centro: { data: zona, error: null } })
      .sesion;
  }

  it('conserva la duración y convierte la hora de pared de la vista a un instante', async () => {
    const r = await prepararMovimiento(conCita(FILA_CITA), DESTINO, AHORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inicio.toISOString()).toBe(INICIO_DESTINO);
    expect(r.fin.getTime() - r.inicio.getTime()).toBe(50 * 60_000);
  });

  it('una cita que ya acabó no se mueve: cita_pasada', async () => {
    const r = await prepararMovimiento(conCita(FILA_CITA), DESTINO, new Date('2026-10-01T09:00:00Z'));
    expect(r).toMatchObject({ ok: false, motivo: 'cita_pasada' });
  });

  it('un destino que ya pasó no se acepta: destino_pasado', async () => {
    const r = await prepararMovimiento(
      conCita(FILA_CITA),
      { ...DESTINO, fecha: '2026-09-26', hora: '11:00' },
      new Date('2026-09-26T09:30:00Z'),
    );
    expect(r).toMatchObject({ ok: false, motivo: 'destino_pasado' });
  });

  it('el borde: un destino exactamente en «ahora» también es pasado', async () => {
    // Cita futura (noviembre) que se adelanta justo a «ahora».
    const futura = { ...FILA_CITA, inicio: '2026-11-05T09:00:00+00:00', fin: '2026-11-05T09:50:00+00:00' };
    const r = await prepararMovimiento(conCita(futura), DESTINO, new Date(INICIO_DESTINO));
    expect(r).toMatchObject({ ok: false, motivo: 'destino_pasado' });
    // Gemela: un minuto antes de «ahora», el mismo destino sí vale.
    const bien = await prepararMovimiento(conCita(futura), DESTINO, new Date(Date.parse(INICIO_DESTINO) - 60_000));
    expect(bien.ok).toBe(true);
  });

  it('02:30 del 29-03-2026 en Madrid no existe', async () => {
    const r = await prepararMovimiento(conCita(FILA_CITA), { ...DESTINO, fecha: '2026-03-29', hora: '02:30' }, new Date('2026-01-01T00:00:00Z'));
    expect(r).toMatchObject({ ok: false, motivo: 'parametro_invalido', mensaje: expect.stringMatching(/no existe/) });
  });

  it('02:30 del 25-10-2026 en Madrid es ambigua', async () => {
    const r = await prepararMovimiento(conCita(FILA_CITA), { ...DESTINO, fecha: '2026-10-25', hora: '02:30' }, AHORA);
    expect(r).toMatchObject({ ok: false, motivo: 'parametro_invalido', mensaje: expect.stringMatching(/se repite/) });
  });

  it('si la vista estaba en otra zona que el centro, no mueve', async () => {
    const r = await prepararMovimiento(conCita(FILA_CITA, 'Atlantic/Canary'), DESTINO, AHORA);
    expect(r).toMatchObject({ ok: false, motivo: 'parametro_invalido', mensaje: expect.stringMatching(/otra zona/) });
  });

  it('sin fila por ninguna puerta: no_autorizado', async () => {
    const { sesion } = sesionFalsa({}, { zona_horaria_centro: { data: 'Europe/Madrid', error: null } });
    expect(await prepararMovimiento(sesion, DESTINO, AHORA)).toMatchObject({ ok: false, motivo: 'no_autorizado' });
  });
});

describe('ubicarEnSerie', () => {
  it('da día y hora de pared en la zona de la SERIE, no en la de la vista', () => {
    const cita = { ...FILA_CITA, zonaHoraria: 'Atlantic/Canary' } as unknown as Parameters<typeof ubicarEnSerie>[0];
    expect(ubicarEnSerie(cita, new Date(INICIO_DESTINO))).toEqual({ fecha: '2026-10-08', hora: '10:00' });
  });
});

describe('reprogramarCita: suelta y «esta»', () => {
  it('una cita suelta va por agenda_actualizar_cita con los instantes en ISO', async () => {
    const { sesion, llamadas } = escenarioSerie({ cita: SUELTA });
    const r = await reprogramarCita(sesion, DESTINO, AHORA);
    expect(r).toEqual({ ok: true, movida: true, propuestasPendientes: 0 });
    expect(llamadas('agenda_actualizar_cita')).toEqual([
      [
        'agenda_actualizar_cita',
        expect.objectContaining({ p_cita_id: CITA_ID, p_inicio: INICIO_DESTINO, p_fin: '2026-10-08T09:50:00.000Z' }),
      ],
    ]);
    expect(llamadas('agenda_editar_serie')).toHaveLength(0);
  });

  it('una cita suelta con alcance es un error, y no escribe', async () => {
    const { sesion, llamadas } = escenarioSerie({ cita: SUELTA });
    const r = await reprogramarCita(sesion, { ...DESTINO, alcance: 'esta' }, AHORA);
    expect(r).toMatchObject({ ok: false, motivo: 'parametro_invalido' });
    expect(llamadas('agenda_actualizar_cita')).toHaveLength(0);
  });

  it('una cita de serie sin alcance pide elegir, y no escribe', async () => {
    const { sesion, rpc } = escenarioSerie();
    const r = await reprogramarCita(sesion, DESTINO, AHORA);
    expect(r).toMatchObject({ ok: false, motivo: 'parametro_invalido', mensaje: expect.stringMatching(/Elige/) });
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(['zona_horaria_centro']);
  });

  it('«esta» va por agenda_editar_serie con inicio y fin, sin previsualizar', async () => {
    const { sesion, llamadas } = escenarioSerie({ editar: { data: { alcance: 'esta', cita_id: CITA_ID }, error: null } });
    const r = await reprogramarCita(sesion, { ...DESTINO, alcance: 'esta' }, AHORA);
    expect(r).toEqual({ ok: true, movida: true, propuestasPendientes: 0 });
    expect(llamadas('agenda_editar_serie')[0][1]).toMatchObject({
      p_alcance: 'esta',
      p_inicio: INICIO_DESTINO,
      p_fin: '2026-10-08T09:50:00.000Z',
    });
    expect(llamadas('agenda_previsualizar_edicion_serie')).toHaveLength(0);
  });
});

describe('reprogramarCita: «esta y las siguientes» (M9c)', () => {
  it('(a) edita la regla y confirma exactamente una propuesta: la de la ancla que editó', async () => {
    const firma = await firmaDe(previaBd());
    const { sesion, llamadas } = escenarioSerie();
    const r = await reprogramarCita(sesion, { ...DESTINO, alcance: 'esta_y_siguientes', firma }, AHORA);

    expect(r).toEqual({ ok: true, movida: true, propuestasPendientes: 1 });
    expect(llamadas('agenda_editar_serie')[0][1]).toMatchObject({
      p_alcance: 'esta_y_siguientes',
      p_fecha: '2026-10-08',
      p_hora_local: '11:00',
    });
    // No la AJENA (misma cita, pero no salió de esta edición) ni la OTRA.
    expect(llamadas('agenda_confirmar_propuesta')).toEqual([
      ['agenda_confirmar_propuesta', { p_propuesta_id: PROPUESTA_ANCLA }],
    ]);
  });

  it('(b) si la firma no coincide, previsualizacion_caducada y no edita', async () => {
    const firma = await firmaDe(previaBd());
    // Entre medias, otra persona cambió la duración de la serie.
    const cambiada = previaBd({
      regla: { ...previaBd().regla, duracion_minutos: 60 },
    });
    const { sesion, llamadas } = escenarioSerie({ previa: cambiada });
    const r = await reprogramarCita(sesion, { ...DESTINO, alcance: 'esta_y_siguientes', firma }, AHORA);

    expect(r).toMatchObject({ ok: false, motivo: 'previsualizacion_caducada' });
    expect(llamadas('agenda_editar_serie')).toHaveLength(0);
    expect(llamadas('agenda_confirmar_propuesta')).toHaveLength(0);
  });

  it('(c) si la propuesta de la ancla no cae donde se soltó, no confirma nada', async () => {
    const firma = await firmaDe(previaBd());
    const { sesion, llamadas } = escenarioSerie({
      propuestas: {
        data: [propuestaBd(PROPUESTA_ANCLA, CITA_ID, '2026-10-08T09:00:01.000Z')],
        error: null,
      },
    });
    const r = await reprogramarCita(sesion, { ...DESTINO, alcance: 'esta_y_siguientes', firma }, AHORA);

    expect(r).toEqual({ ok: true, movida: false, propuestasPendientes: 2 });
    expect(llamadas('agenda_confirmar_propuesta')).toHaveLength(0);
  });

  it('(d) un 23P01 al confirmar no es un fallo: la regla cambió y la propuesta queda pendiente', async () => {
    const firma = await firmaDe(previaBd());
    const { sesion, llamadas } = escenarioSerie({
      confirmar: { data: null, error: { code: '23P01', message: 'conflicting key value violates exclusion constraint' } },
    });
    const r = await reprogramarCita(sesion, { ...DESTINO, alcance: 'esta_y_siguientes', firma }, AHORA);

    expect(r).toEqual({ ok: true, movida: false, propuestasPendientes: 2, motivoNoMovida: 'hueco_ocupado' });
    expect(llamadas('agenda_confirmar_propuesta')).toHaveLength(1);
  });

  it('(d′) un rechazo 22023 al confirmar lleva su detalle', async () => {
    const firma = await firmaDe(previaBd());
    const { sesion } = escenarioSerie({
      confirmar: {
        data: null,
        error: { code: '22023', message: 'La serie ya tiene otra regla: esta propuesta quedó obsoleta.' },
      },
    });
    const r = await reprogramarCita(sesion, { ...DESTINO, alcance: 'esta_y_siguientes', firma }, AHORA);
    expect(r).toMatchObject({ ok: true, movida: false, motivoNoMovida: 'otraRegla' });
  });

  it('(e) nunca descarta una propuesta, en ningún camino', async () => {
    const firma = await firmaDe(previaBd());
    const caminos = [
      escenarioSerie(),
      escenarioSerie({ confirmar: { data: null, error: { code: '23P01', message: 'x' } } }),
      escenarioSerie({ propuestas: { data: [], error: null } }),
      escenarioSerie({ propuestas: { data: null, error: { code: '42501', message: 'x' } } }),
    ];
    for (const { sesion, llamadas } of caminos) {
      await reprogramarCita(sesion, { ...DESTINO, alcance: 'esta_y_siguientes', firma }, AHORA);
      expect(llamadas('agenda_descartar_propuesta')).toHaveLength(0);
    }
  });

  it('si no se puede leer la bandeja tras editar, la operación sigue siendo ok y no confirma', async () => {
    const firma = await firmaDe(previaBd());
    const { sesion, llamadas } = escenarioSerie({ propuestas: { data: null, error: { code: '42501', message: 'x' } } });
    const r = await reprogramarCita(sesion, { ...DESTINO, alcance: 'esta_y_siguientes', firma }, AHORA);
    expect(r).toMatchObject({ ok: true, movida: false, propuestasPendientes: 2, motivoNoMovida: 'no_autorizado' });
    expect(llamadas('agenda_confirmar_propuesta')).toHaveLength(0);
  });

  it('una cita movida a mano no admite «esta y las siguientes», y no previsualiza', async () => {
    const { sesion, llamadas } = escenarioSerie({ cita: { ...FILA_CITA, desviada: true } });
    const r = await reprogramarCita(sesion, { ...DESTINO, alcance: 'esta_y_siguientes', firma: 'a'.repeat(64) }, AHORA);
    expect(r).toMatchObject({ ok: false, motivo: 'parametro_invalido', detalle: 'movidaAMano' });
    expect(llamadas('agenda_previsualizar_edicion_serie')).toHaveLength(0);
    expect(llamadas('agenda_editar_serie')).toHaveLength(0);
  });

  it('un rechazo de la base al editar se devuelve con su detalle y no confirma', async () => {
    const firma = await firmaDe(previaBd());
    const { sesion, llamadas } = escenarioSerie({
      editar: { data: null, error: { code: '22023', message: 'La cita ya ha empezado o ha pasado.' } },
    });
    const r = await reprogramarCita(sesion, { ...DESTINO, alcance: 'esta_y_siguientes', firma }, AHORA);
    expect(r).toMatchObject({ ok: false, motivo: 'parametro_invalido', detalle: 'yaEmpezada' });
    expect(llamadas('agenda_confirmar_propuesta')).toHaveLength(0);
  });
});

describe('evaluarModificarSerie (guardas de §8.3)', () => {
  async function evaluar(previa: ReturnType<typeof previaBd>, cita: Record<string, unknown> = {}) {
    const { sesion } = escenarioSerie({ previa });
    const minima = {
      id: CITA_ID,
      inicio: new Date(FILA_CITA.inicio),
      fin: new Date(FILA_CITA.fin),
      serieId: SERIE_ID,
      desviada: false,
      centroId: 'ce1',
      zonaHoraria: 'Europe/Madrid',
      estado: 'programada' as const,
      ...cita,
    };
    return evaluarModificarSerie(sesion, minima, new Date(INICIO_DESTINO));
  }

  it('disponible, con la firma de lo que devolvió la base', async () => {
    const r = await evaluar(previaBd());
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    expect(r.firma).toBe(firmarPrevisualizacion(r.previa));
  });

  it('la serie en otra zona que la cita: serieOtraZona', async () => {
    const previa = previaBd({ regla_anterior: { ...previaBd().regla_anterior, zona_horaria: 'Atlantic/Canary' } });
    expect(await evaluar(previa)).toMatchObject({ disponible: false, bloqueo: 'serieOtraZona' });
  });

  it('nada que cambiar: sinCambio', async () => {
    expect(await evaluar(previaBd({ cambia: false, citas: [] }))).toMatchObject({ disponible: false, bloqueo: 'sinCambio' });
  });

  it('la ancla no cae en el instante soltado: horaDistintaEnSerie', async () => {
    const previa = previaBd({}, { inicio: '2026-10-08T12:00:00+02:00' });
    expect(await evaluar(previa)).toMatchObject({ disponible: false, bloqueo: 'horaDistintaEnSerie' });
  });

  it('la ancla con una hora ambigua en la serie: horaDistintaEnSerie', async () => {
    const previa = previaBd({}, { clasificacion: 'ambigua' });
    expect(await evaluar(previa)).toMatchObject({ disponible: false, bloqueo: 'horaDistintaEnSerie' });
  });

  it('un fallo de la base se devuelve como fallo, no como bloqueo', async () => {
    const { sesion } = sesionFalsa(
      {},
      { agenda_previsualizar_edicion_serie: { data: null, error: { code: '42501', message: 'La cita no existe o no es tuya.' } } },
    );
    const minima = {
      id: CITA_ID,
      inicio: new Date(FILA_CITA.inicio),
      fin: new Date(FILA_CITA.fin),
      serieId: SERIE_ID,
      desviada: false,
      centroId: 'ce1',
      zonaHoraria: 'Europe/Madrid',
      estado: 'programada' as const,
    };
    const r = await evaluarModificarSerie(sesion, minima, new Date(INICIO_DESTINO));
    expect(r).toMatchObject({ disponible: false, fallo: { ok: false, motivo: 'no_autorizado' } });
  });
});

// Para que el tipo no quede sin usar si alguien quita la última prueba que lo nombra.
export type _Previa = PrevisualizacionSerie;
