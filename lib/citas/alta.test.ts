import { describe, expect, it, vi } from 'vitest';

import {
  crearSerieAlta,
  firmarPrevisualizacionAlta,
  leerBloques,
  leerUltimasCitasPaciente,
  previsualizarAlta,
} from './alta';
import type { Sesion } from './tipos';

type Respuesta = { data: unknown; error: unknown };

/** Constructor de consultas que recuerda cada llamada: la prueba mira qué se pidió. */
function consulta(respuesta: Respuesta) {
  const cadena: Record<string, unknown> = {};
  for (const metodo of ['select', 'eq', 'neq', 'lt', 'order', 'limit']) cadena[metodo] = vi.fn(() => cadena);
  cadena.then = (resolver: (r: Respuesta) => unknown) => Promise.resolve(respuesta).then(resolver);
  return cadena as Record<string, ReturnType<typeof vi.fn>> & { then: unknown };
}

function sesionFalsa(opciones: { tabla?: Respuesta; rpc?: Record<string, Respuesta> } = {}) {
  const cadena = consulta(opciones.tabla ?? { data: [], error: null });
  const from = vi.fn(() => cadena);
  const rpc = vi.fn((nombre: string) => Promise.resolve(opciones.rpc?.[nombre] ?? { data: null, error: null }));
  const sesion = {
    supabase: { from, rpc } as unknown as Sesion['supabase'],
    usuario: { id: 'u1' } as unknown as Sesion['usuario'],
  };
  return { sesion, from, rpc, cadena };
}

const PACIENTE = '11111111-1111-4111-8111-111111111111';
const PROFESIONAL = '22222222-2222-4222-8222-222222222222';
const CENTRO = '33333333-3333-4333-8333-333333333333';

describe('leerUltimasCitasPaciente', () => {
  const entrada = { pacienteId: PACIENTE, profesionalId: PROFESIONAL, antesDe: new Date('2026-10-05T10:00:00Z') };

  it('pide orden descendente y límite de seis: el llamante no reordena ni recorta (E15.3)', async () => {
    const { sesion, cadena } = sesionFalsa();
    await leerUltimasCitasPaciente(sesion, 'profesional_sanitario', entrada);
    expect(cadena.order).toHaveBeenCalledWith('inicio', { ascending: false });
    expect(cadena.limit).toHaveBeenCalledWith(6);
  });

  it('solo pide inicio y zona_horaria, sin canceladas y anteriores a antesDe', async () => {
    const { sesion, cadena } = sesionFalsa();
    await leerUltimasCitasPaciente(sesion, 'administrador', entrada);
    expect(cadena.select).toHaveBeenCalledWith('inicio, zona_horaria');
    expect(cadena.neq).toHaveBeenCalledWith('estado', 'cancelada');
    expect(cadena.lt).toHaveBeenCalledWith('inicio', '2026-10-05T10:00:00.000Z');
    expect(cadena.eq).toHaveBeenCalledWith('paciente_id', PACIENTE);
    expect(cadena.eq).toHaveBeenCalledWith('profesional_id', PROFESIONAL);
  });

  it('el técnico lee citas_agenda, nunca citas; los demás roles, citas', async () => {
    const tecnico = sesionFalsa();
    await leerUltimasCitasPaciente(tecnico.sesion, 'tecnico_administrativo', entrada);
    expect(tecnico.from).toHaveBeenCalledWith('citas_agenda');
    for (const rol of ['administrador', 'profesional_sanitario']) {
      const otro = sesionFalsa();
      await leerUltimasCitasPaciente(otro.sesion, rol, entrada);
      expect(otro.from).toHaveBeenCalledWith('citas');
    }
  });

  it('devuelve camelCase y descarta filas incompletas', async () => {
    const { sesion } = sesionFalsa({
      tabla: {
        data: [
          { inicio: '2026-09-29T10:00:00+00:00', zona_horaria: 'Europe/Madrid' },
          { inicio: null, zona_horaria: 'Europe/Madrid' },
        ],
        error: null,
      },
    });
    const r = await leerUltimasCitasPaciente(sesion, 'administrador', entrada);
    expect(r).toEqual({ ok: true, citas: [{ inicio: '2026-09-29T10:00:00+00:00', zonaHoraria: 'Europe/Madrid' }] });
  });

  it('un error de la base no lanza: devuelve el motivo', async () => {
    const { sesion } = sesionFalsa({ tabla: { data: null, error: { code: '42501', message: 'x' } } });
    const r = await leerUltimasCitasPaciente(sesion, 'administrador', entrada);
    expect(r.ok).toBe(false);
  });
});

describe('leerBloques', () => {
  it('pasa a camelCase y recorta la hora a HH:MM', async () => {
    const { sesion, rpc } = sesionFalsa({
      rpc: {
        agenda_bloques_profesional: {
          data: [
            { fecha: '2026-10-06', hora_local: '10:00:00', inicio: 'a', fin: 'b', estado: 'libre' },
            { fecha: '2026-10-06', hora_local: '11:00:00', inicio: 'c', fin: 'd', estado: 'ocupado' },
          ],
          error: null,
        },
      },
    });
    const r = await leerBloques(sesion, {
      profesionalId: PROFESIONAL,
      centroId: CENTRO,
      desde: '2026-10-06',
      hasta: '2026-10-12',
      duracionMinutos: 50,
    });
    expect(rpc).toHaveBeenCalledWith('agenda_bloques_profesional', {
      p_profesional_id: PROFESIONAL,
      p_centro_id: CENTRO,
      p_desde: '2026-10-06',
      p_hasta: '2026-10-12',
      p_duracion_minutos: 50,
    });
    expect(r).toMatchObject({ ok: true, bloques: [{ horaLocal: '10:00', estado: 'libre' }, { horaLocal: '11:00', estado: 'ocupado' }] });
  });
});

const PREVIA_BD = {
  zona_horaria: 'Europe/Madrid',
  sesiones: [
    {
      fecha: '2027-03-30',
      hora_local: '02:30:00',
      inicio: '2027-03-28T01:00:00+00:00',
      fin: '2027-03-28T01:50:00+00:00',
      clasificacion: 'inexistente',
      bloqueo: null,
      alternativa: null,
    },
    {
      fecha: '2027-04-06',
      hora_local: '02:30:00',
      inicio: '2027-04-06T00:30:00+00:00',
      fin: '2027-04-06T01:20:00+00:00',
      clasificacion: 'normal',
      bloqueo: 'festivo',
      alternativa: { fecha: '2027-04-07', inicio: '2027-04-07T00:30:00+00:00', fin: '2027-04-07T01:20:00+00:00' },
    },
  ],
};

const ENTRADA_PREVIA = {
  pacienteId: PACIENTE,
  profesionalId: PROFESIONAL,
  centroId: CENTRO,
  periodicidad: 'semanal' as const,
  diaSemana: 2,
  horaLocal: '02:30',
  duracionMinutos: 50,
  desde: '2027-03-30',
  sesionesTotales: 2,
};

describe('previsualizarAlta', () => {
  it('valida la forma, pasa a camelCase y firma', async () => {
    const { sesion } = sesionFalsa({ rpc: { agenda_previsualizar_alta: { data: PREVIA_BD, error: null } } });
    const r = await previsualizarAlta(sesion, ENTRADA_PREVIA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previa.sesiones[0]).toMatchObject({ horaLocal: '02:30', clasificacion: 'inexistente', bloqueo: null });
    expect(r.previa.sesiones[1].alternativa?.fecha).toBe('2027-04-07');
    expect(r.firma).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falla cerrado ante una clave desconocida', async () => {
    const mala = { ...PREVIA_BD, extra: 1 };
    const { sesion } = sesionFalsa({ rpc: { agenda_previsualizar_alta: { data: mala, error: null } } });
    const r = await previsualizarAlta(sesion, ENTRADA_PREVIA);
    expect(r).toMatchObject({ ok: false, motivo: 'desconocido' });
  });

  it('la firma cambia si cambia una alternativa o un bloqueo', async () => {
    const a = sesionFalsa({ rpc: { agenda_previsualizar_alta: { data: PREVIA_BD, error: null } } });
    const otra = structuredClone(PREVIA_BD);
    otra.sesiones[1].bloqueo = 'ausencia';
    const b = sesionFalsa({ rpc: { agenda_previsualizar_alta: { data: otra, error: null } } });
    const ra = await previsualizarAlta(a.sesion, ENTRADA_PREVIA);
    const rb = await previsualizarAlta(b.sesion, ENTRADA_PREVIA);
    if (!ra.ok || !rb.ok) throw new Error('inesperado');
    expect(ra.firma).not.toBe(rb.firma);
    expect(firmarPrevisualizacionAlta(ra.previa, ENTRADA_PREVIA)).toBe(ra.firma);
  });
});

describe('crearSerieAlta', () => {
  const entrada = {
    pacienteId: PACIENTE,
    profesionalId: PROFESIONAL,
    centroId: CENTRO,
    tipoTerapiaId: '44444444-4444-4444-8444-444444444444',
    fecha: '2027-03-30',
    horaLocal: '10:00',
    sala: null,
    notaOperativa: null,
    excluir: [],
    aceptarAlternativas: ['2027-04-06'],
    periodicidad: 'semanal' as const,
    diaSemana: 2,
    duracionMinutos: 50,
    sesionesTotales: 3,
  };

  it('pide p_estricta_primera, confirma solo las propuestas aceptadas y deja el resto pendiente', async () => {
    const { sesion, rpc } = sesionFalsa({
      rpc: {
        agenda_crear_serie: {
          data: {
            serie_id: 'S',
            zona_horaria: 'Europe/Madrid',
            citas: [{ cita_id: 'c1', fecha: '2027-03-30' }],
            propuestas: [
              { propuesta_id: 'p1', fecha: '2027-04-06', motivo: 'festivo' },
              { propuesta_id: 'p2', fecha: '2027-04-13', motivo: 'ocupada' },
            ],
          },
          error: null,
        },
        agenda_confirmar_propuesta: { data: 'c2', error: null },
      },
    });
    const r = await crearSerieAlta(sesion, entrada);
    expect(rpc).toHaveBeenCalledWith(
      'agenda_crear_serie',
      expect.objectContaining({ p_estricta_primera: true, p_excluir: [], p_sesiones_totales: 3 }),
    );
    expect(rpc).toHaveBeenCalledWith('agenda_confirmar_propuesta', { p_propuesta_id: 'p1' });
    expect(rpc).not.toHaveBeenCalledWith('agenda_confirmar_propuesta', { p_propuesta_id: 'p2' });
    expect(r).toEqual({
      ok: true,
      serieId: 'S',
      citaIds: ['c1', 'c2'],
      propuestasPendientes: [{ fecha: '2027-04-13', motivo: 'ocupada' }],
    });
  });

  it('un choque en la primera sesión (23P01) devuelve hueco_ocupado', async () => {
    const { sesion } = sesionFalsa({ rpc: { agenda_crear_serie: { data: null, error: { code: '23P01', message: 'x' } } } });
    const r = await crearSerieAlta(sesion, entrada);
    expect(r).toMatchObject({ ok: false, motivo: 'hueco_ocupado' });
  });
});
