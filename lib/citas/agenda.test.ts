import { describe, expect, it, vi } from 'vitest';

import { estadoParaPunto, leerAlertasNotaPendiente, leerCita, leerCitasRango, zonaDeCentro } from './agenda';
import type { Sesion } from './tipos';

/**
 * Doble mínimo del cliente de Supabase: cada tabla devuelve lo que diga la
 * prueba, sea cual sea la cadena de filtros. No hay base aquí; la RLS de estas
 * lecturas la prueba `scripts/rls/18-agenda-rango.sql`.
 */
type Respuesta = { data: unknown; error: unknown };

function consulta(respuesta: Respuesta) {
  const cadena: Record<string, unknown> = {};
  for (const metodo of ['select', 'eq', 'in', 'order']) cadena[metodo] = vi.fn(() => cadena);
  cadena.maybeSingle = () => Promise.resolve(respuesta);
  cadena.then = (resolver: (r: Respuesta) => unknown) => Promise.resolve(respuesta).then(resolver);
  return cadena;
}

function sesionFalsa(tablas: Record<string, Respuesta>, rpc: Record<string, Respuesta> = {}) {
  const from = vi.fn((tabla: string) => consulta(tablas[tabla] ?? { data: null, error: null }));
  const llamadaRpc = vi.fn((nombre: string) => Promise.resolve(rpc[nombre] ?? { data: null, error: null }));
  const sesion = {
    supabase: { from, rpc: llamadaRpc } as unknown as Sesion['supabase'],
    usuario: { id: 'u1' } as unknown as Sesion['usuario'],
  };
  return { sesion, from, rpc: llamadaRpc };
}

const CITA = {
  id: 'c1',
  inicio: '2026-10-01T08:00:00+00:00',
  fin: '2026-10-01T08:50:00+00:00',
  serie_id: 's1',
  desviada: false,
  centro_id: 'ce1',
  zona_horaria: 'Europe/Madrid',
  estado: 'programada',
};

describe('leerCita', () => {
  it('lee de citas cuando la RLS la deja ver', async () => {
    const { sesion, from } = sesionFalsa({ citas: { data: CITA, error: null } });
    const resultado = await leerCita(sesion, 'c1');
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.cita.inicio.toISOString()).toBe('2026-10-01T08:00:00.000Z');
    expect(resultado.cita.serieId).toBe('s1');
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('si citas no la da, prueba citas_agenda (la puerta del técnico)', async () => {
    const { sesion, from } = sesionFalsa({
      citas: { data: null, error: null },
      citas_agenda: { data: CITA, error: null },
    });
    const resultado = await leerCita(sesion, 'c1');
    expect(resultado.ok).toBe(true);
    expect(from.mock.calls.map(([tabla]) => tabla)).toEqual(['citas', 'citas_agenda']);
  });

  it('sin fila en ninguna de las dos: no_autorizado', async () => {
    const { sesion } = sesionFalsa({});
    const resultado = await leerCita(sesion, 'c1');
    expect(resultado).toMatchObject({ ok: false, motivo: 'no_autorizado' });
  });
});

describe('leerCitasRango', () => {
  it('manda el rango como ISO y devuelve instantes como Date y claves en camelCase', async () => {
    const fila = {
      ...CITA,
      paciente_id: 'p1',
      profesional_id: 'pr1',
      sala: null,
      motivo_desviacion: null,
      tipo_terapia_nombre: null,
      nota_operativa: null,
      paciente_nombre: 'Ana',
      paciente_apellidos: 'García López',
      profesional_nombre: 'Luis',
      centro_nombre: 'Centro',
      en_curso: true,
      reprogramable: false,
      nota_pendiente: false,
    };
    const { sesion, rpc } = sesionFalsa({}, { agenda_citas_rango: { data: [fila], error: null } });
    const desde = new Date('2026-09-28T00:00:00+02:00');
    const hasta = new Date('2026-10-05T00:00:00+02:00');

    const resultado = await leerCitasRango(sesion, desde, hasta);

    expect(rpc).toHaveBeenCalledWith('agenda_citas_rango', {
      p_desde: desde.toISOString(),
      p_hasta: hasta.toISOString(),
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.filas[0].fin).toBeInstanceOf(Date);
    expect(resultado.filas[0]).toMatchObject({ pacienteApellidos: 'García López', enCurso: true, tipoTerapiaNombre: null });
  });

  it('un 22023 (rango de más de 62 días) no se disfraza de agenda vacía', async () => {
    const { sesion } = sesionFalsa(
      {},
      { agenda_citas_rango: { data: null, error: { code: '22023', message: 'el rango no puede pasar de 62 días' } } },
    );
    const resultado = await leerCitasRango(sesion, new Date(0), new Date(1));
    expect(resultado).toMatchObject({ ok: false, motivo: 'parametro_invalido' });
  });
});

describe('zonaDeCentro', () => {
  it('devuelve la zona que da la base', async () => {
    const { sesion, rpc } = sesionFalsa({}, { zona_horaria_centro: { data: 'Atlantic/Canary', error: null } });
    expect(await zonaDeCentro(sesion, null)).toEqual({ ok: true, zona: 'Atlantic/Canary' });
    expect(rpc).toHaveBeenCalledWith('zona_horaria_centro', { p_centro_id: null });
  });

  it('sin zona es un fallo, no una zona vacía', async () => {
    const { sesion } = sesionFalsa({}, { zona_horaria_centro: { data: null, error: null } });
    expect(await zonaDeCentro(sesion, 'ce1')).toMatchObject({ ok: false, motivo: 'desconocido' });
  });
});

describe('leerAlertasNotaPendiente', () => {
  it('pone el nombre del paciente y deja nulo el que la RLS no deja ver', async () => {
    const { sesion } = sesionFalsa({
      alertas_documentacion: {
        data: [
          { id: 'a1', paciente_id: 'p1', tipo: 'nota_sin_firmar', fecha_referencia: '2026-09-20', creada_en: 'x' },
          { id: 'a2', paciente_id: 'p2', tipo: 'nota_sin_firmar', fecha_referencia: '2026-09-24', creada_en: 'y' },
        ],
        error: null,
      },
      pacientes: { data: [{ id: 'p1', nombre: 'Ana', apellidos: 'García' }], error: null },
    });

    const resultado = await leerAlertasNotaPendiente(sesion);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.alertas.map((a) => a.pacienteNombre)).toEqual(['Ana García', null]);
  });

  // Revisión SQL H2 (choque 2 de interfaz.md): el secreto profesional es del profesional, no del
  // cargo. La RLS deja al administrador ver todas las alertas; la bandeja no las enseña.
  it('con soloPropias filtra por el profesional de la sesión; sin él, no filtra', async () => {
    const { sesion, from } = sesionFalsa({ alertas_documentacion: { data: [], error: null } });

    await leerAlertasNotaPendiente(sesion, { soloPropias: true });
    const conFiltro = from.mock.results[0].value.eq as ReturnType<typeof vi.fn>;
    expect(conFiltro).toHaveBeenCalledWith('profesional_id', 'u1');

    from.mockClear();
    await leerAlertasNotaPendiente(sesion);
    const sinFiltro = from.mock.results[0].value.eq as ReturnType<typeof vi.fn>;
    expect(sinFiltro).not.toHaveBeenCalledWith('profesional_id', expect.anything());
  });

  it('un fallo de lectura es un fallo, no una bandeja vacía', async () => {
    const { sesion } = sesionFalsa({
      alertas_documentacion: { data: null, error: { code: '42501', message: 'permission denied' } },
    });
    expect(await leerAlertasNotaPendiente(sesion)).toMatchObject({ ok: false, motivo: 'no_autorizado' });
  });
});

describe('estadoParaPunto', () => {
  it('«en curso» manda sobre el estado guardado', () => {
    expect(estadoParaPunto('confirmada', true)).toBe('en_curso');
    expect(estadoParaPunto('confirmada', false)).toBe('confirmada');
  });
});
