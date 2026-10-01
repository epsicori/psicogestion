import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firmarPrevisualizacion, previsualizarEdicionSerie } from './previsualizar';
import type { Sesion } from './tipos';

type Respuesta = { data: unknown; error: unknown };

function sesionFalsa(respuesta: Respuesta) {
  const rpc = vi.fn(() => Promise.resolve(respuesta));
  const sesion = {
    supabase: { rpc } as unknown as Sesion['supabase'],
    usuario: { id: 'u1' } as unknown as Sesion['usuario'],
  };
  return { sesion, rpc };
}

const CITA = '11111111-1111-4111-8111-111111111111';
const SERIE = '22222222-2222-4222-8222-222222222222';

function previaBd() {
  return {
    serie_id: SERIE,
    desde_cita_id: CITA,
    fecha_origen: '2026-10-01',
    fecha_destino: '2026-10-08',
    cambia: true,
    regla_anterior: {
      periodicidad: 'mensual',
      dia_semana: 4,
      hora_local: '10:00:00',
      duracion_minutos: 50,
      zona_horaria: 'Europe/Madrid',
    },
    regla: {
      periodicidad: 'mensual',
      dia_semana: 4,
      hora_local: '11:00:00',
      duracion_minutos: 50,
      zona_horaria: 'Europe/Madrid',
      ordinal: 2,
      ultimo: false,
      recorte: false,
    },
    citas: [
      {
        cita_id: CITA,
        fecha_actual: '2026-10-01',
        fecha_nueva: '2026-10-08',
        hora_local: '11:00:00',
        inicio: '2026-10-08T11:00:00+02:00',
        fin: '2026-10-08T11:50:00+02:00',
        clasificacion: 'normal',
        recortada: false,
      },
    ],
  };
}

const ENTRADA = { citaId: CITA, fecha: '2026-10-08', horaLocal: '11:00' };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('previsualizarEdicionSerie', () => {
  it('manda solo cita, fecha y hora: arrastrar no cambia duración ni zona', async () => {
    const { sesion, rpc } = sesionFalsa({ data: previaBd(), error: null });
    await previsualizarEdicionSerie(sesion, ENTRADA);
    expect(rpc).toHaveBeenCalledWith('agenda_previsualizar_edicion_serie', {
      p_cita_id: CITA,
      p_fecha: '2026-10-08',
      p_hora_local: '11:00',
    });
  });

  it('pasa a camelCase, recorta las horas a HH:MM y normaliza los instantes a UTC', async () => {
    const { sesion } = sesionFalsa({ data: previaBd(), error: null });
    const r = await previsualizarEdicionSerie(sesion, ENTRADA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previa.reglaAnterior.horaLocal).toBe('10:00');
    expect(r.previa.regla).toMatchObject({ horaLocal: '11:00', ordinal: 2, ultimo: false });
    expect(r.previa.citas[0]).toMatchObject({ citaId: CITA, inicio: '2026-10-08T09:00:00.000Z', horaLocal: '11:00' });
  });

  it('admite inicio nulo (propuesta en el pasado) y fechas nulas', async () => {
    const previa = previaBd();
    previa.citas[0] = { ...previa.citas[0], inicio: null as unknown as string, fin: null as unknown as string };
    const { sesion } = sesionFalsa({
      data: { ...previa, fecha_origen: null, fecha_destino: null },
      error: null,
    });
    const r = await previsualizarEdicionSerie(sesion, ENTRADA);
    expect(r.ok).toBe(true);
  });

  it('falla cerrado si la forma no es la esperada (clave de más)', async () => {
    const { sesion } = sesionFalsa({ data: { ...previaBd(), sorpresa: 1 }, error: null });
    expect(await previsualizarEdicionSerie(sesion, ENTRADA)).toMatchObject({ ok: false, motivo: 'desconocido' });
  });

  it('falla cerrado con una clasificación desconocida', async () => {
    const previa = previaBd();
    previa.citas[0] = { ...previa.citas[0], clasificacion: 'rara' };
    const { sesion } = sesionFalsa({ data: previa, error: null });
    expect(await previsualizarEdicionSerie(sesion, ENTRADA)).toMatchObject({ ok: false, motivo: 'desconocido' });
  });

  it('un error de la base pasa por resultadoDeError, con su detalle', async () => {
    const { sesion } = sesionFalsa({
      data: null,
      error: { code: '22023', message: 'La cita ya ha empezado o ha pasado.' },
    });
    expect(await previsualizarEdicionSerie(sesion, ENTRADA)).toMatchObject({
      ok: false,
      motivo: 'parametro_invalido',
      detalle: 'yaEmpezada',
    });
  });
});

describe('firmarPrevisualizacion', () => {
  async function previa(bd: ReturnType<typeof previaBd>) {
    const r = await previsualizarEdicionSerie(sesionFalsa({ data: bd, error: null }).sesion, ENTRADA);
    if (!r.ok) throw new Error('no parsea');
    return r.previa;
  }

  it('es estable: el mismo instante escrito con otro desfase da la misma firma', async () => {
    const a = previaBd();
    const b = previaBd();
    b.citas[0] = { ...b.citas[0], inicio: '2026-10-08T09:00:00+00:00' };
    expect(firmarPrevisualizacion(await previa(a))).toBe(firmarPrevisualizacion(await previa(b)));
  });

  it('cambia si cambia la regla (duración, ordinal) o dónde cae una cita', async () => {
    const base = firmarPrevisualizacion(await previa(previaBd()));
    const duracion = previaBd();
    duracion.regla = { ...duracion.regla, duracion_minutos: 60 };
    const ordinal = previaBd();
    ordinal.regla = { ...ordinal.regla, ordinal: 3 };
    const cae = previaBd();
    cae.citas[0] = { ...cae.citas[0], fecha_nueva: '2026-10-15' };

    for (const otra of [duracion, ordinal, cae]) {
      expect(firmarPrevisualizacion(await previa(otra))).not.toBe(base);
    }
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });
});
