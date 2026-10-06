import { describe, expect, it, vi } from 'vitest';

import {
  estadoParaPunto,
  leerCita,
  leerCitasRango,
  leerNombresPacientes,
  leerPendientes,
  TOPE_PENDIENTES,
  zonaDeCentro,
} from './agenda';
import type { Sesion } from './tipos';

/**
 * Doble mínimo del cliente de Supabase: cada tabla devuelve lo que diga la
 * prueba, sea cual sea la cadena de filtros. No hay base aquí; la RLS de estas
 * lecturas la prueba `scripts/rls/18-agenda-rango.sql`.
 */
type Respuesta = { data: unknown; error: unknown; count?: number | null };

function consulta(respuesta: Respuesta) {
  const cadena: Record<string, unknown> = {};
  for (const metodo of ['select', 'eq', 'in', 'order', 'range', 'or', 'ilike', 'textSearch', 'filter']) cadena[metodo] = vi.fn(() => cadena);
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

const COLUMNAS = 'id, paciente_id, tipo, fecha_referencia, creada_en, nivel, origen_tabla, origen_id';

function filaAlerta(i: number, parcial: Record<string, unknown> = {}) {
  return {
    id: `a${i}`,
    paciente_id: `p${i}`,
    tipo: 'nota_sin_firmar',
    fecha_referencia: '2026-09-20',
    creada_en: '2026-09-20T10:00:00Z',
    nivel: 1,
    origen_tabla: 'citas',
    origen_id: `c${i}`,
    ...parcial,
  };
}

function cadenaDe(from: ReturnType<typeof vi.fn>, indice = 0) {
  return from.mock.results[indice].value as Record<string, ReturnType<typeof vi.fn>>;
}

describe('leerPendientes (T-048)', () => {
  it('lee solo las 8 columnas, con recuento exacto y el tope explícito desde 0', async () => {
    const { sesion, from } = sesionFalsa({
      alertas_documentacion_nivel: { data: [filaAlerta(1)], error: null, count: 1 },
    });
    await leerPendientes(sesion, { soloPropias: false });
    const cadena = cadenaDe(from);
    expect(from).toHaveBeenCalledWith('alertas_documentacion_nivel');
    expect(cadena.select).toHaveBeenCalledWith(COLUMNAS, { count: 'exact' });
    expect(cadena.eq).toHaveBeenCalledWith('estado', 'abierta');
    expect(cadena.range).toHaveBeenCalledWith(0, TOPE_PENDIENTES - 1);
    expect(TOPE_PENDIENTES).toBe(1000);
  });

  it('pide el orden de la bandeja: nivel, referencia, creación e id, con nulos al final', async () => {
    const { sesion, from } = sesionFalsa({ alertas_documentacion_nivel: { data: [], error: null, count: 0 } });
    await leerPendientes(sesion, { soloPropias: false });
    expect(cadenaDe(from).order.mock.calls).toEqual([
      ['nivel', { ascending: false, nullsFirst: false }],
      ['fecha_referencia', { ascending: true, nullsFirst: false }],
      ['creada_en', { ascending: true, nullsFirst: false }],
      ['id', { ascending: true }],
    ]);
  });

  it('devuelve camelCase con los identificadores de origen y el nivel acotado', async () => {
    const { sesion } = sesionFalsa({
      alertas_documentacion_nivel: {
        data: [filaAlerta(1, { nivel: 3 }), filaAlerta(2, { nivel: 9, origen_id: null })],
        error: null,
        count: 2,
      },
    });
    const r = await leerPendientes(sesion, { soloPropias: false });
    expect(r).toEqual({
      ok: true,
      total: 2,
      recortada: false,
      alertas: [
        {
          id: 'a1',
          pacienteId: 'p1',
          tipo: 'nota_sin_firmar',
          fechaReferencia: '2026-09-20',
          creadaEn: '2026-09-20T10:00:00Z',
          nivel: 3,
          origenTabla: 'citas',
          origenId: 'c1',
        },
        expect.objectContaining({ id: 'a2', nivel: null, origenId: null }),
      ],
    });
  });

  it('descarta las filas sin id, paciente o tipo', async () => {
    const { sesion } = sesionFalsa({
      alertas_documentacion_nivel: {
        data: [filaAlerta(1), filaAlerta(2, { id: null }), filaAlerta(3, { paciente_id: null }), filaAlerta(4, { tipo: null })],
        error: null,
        count: 4,
      },
    });
    const r = await leerPendientes(sesion, {});
    expect(r.ok && r.alertas.map((a) => a.id)).toEqual(['a1']);
  });

  // Revisión SQL H2 (choque 2 de interfaz.md): el secreto profesional es del profesional, no del
  // cargo. La RLS deja al administrador ver todas las alertas; la bandeja no las enseña.
  it('con soloPropias filtra por el profesional de la sesión; sin él, no filtra', async () => {
    const { sesion, from } = sesionFalsa({ alertas_documentacion_nivel: { data: [], error: null, count: 0 } });
    await leerPendientes(sesion, { soloPropias: true });
    expect(cadenaDe(from).eq).toHaveBeenCalledWith('profesional_id', 'u1');

    from.mockClear();
    await leerPendientes(sesion, { soloPropias: false });
    expect(cadenaDe(from).eq).not.toHaveBeenCalledWith('profesional_id', expect.anything());
  });

  it('con tipos, nivel y paciente, la consulta se estrecha; sin ellos, no', async () => {
    const { sesion, from } = sesionFalsa({ alertas_documentacion_nivel: { data: [], error: null, count: 0 } });
    await leerPendientes(sesion, {
      soloPropias: false,
      tipos: ['consentimiento_pendiente', 'informe_pendiente'],
      nivel: 2,
      pacienteId: 'p9',
    });
    const con = cadenaDe(from);
    expect(con.in).toHaveBeenCalledWith('tipo', ['consentimiento_pendiente', 'informe_pendiente']);
    expect(con.eq).toHaveBeenCalledWith('nivel', 2);
    expect(con.eq).toHaveBeenCalledWith('paciente_id', 'p9');

    from.mockClear();
    await leerPendientes(sesion, { soloPropias: false });
    const sin = cadenaDe(from);
    expect(sin.in).not.toHaveBeenCalled();
    expect(sin.eq).not.toHaveBeenCalledWith('nivel', expect.anything());
    expect(sin.eq).not.toHaveBeenCalledWith('paciente_id', expect.anything());
  });

  it('con una lista de tipos vacía no consulta nada y devuelve vacío', async () => {
    const { sesion, from } = sesionFalsa({});
    const r = await leerPendientes(sesion, { soloPropias: false, tipos: [] });
    expect(from).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, alertas: [], total: 0, recortada: false });
  });

  it('con un recuento mayor que lo leído, lo declara recortado y conserva el total', async () => {
    const filas = Array.from({ length: 1000 }, (_, i) => filaAlerta(i));
    const { sesion } = sesionFalsa({ alertas_documentacion_nivel: { data: filas, error: null, count: 1500 } });
    const r = await leerPendientes(sesion, {});
    expect(r).toMatchObject({ ok: true, total: 1500, recortada: true });
    expect(r.ok && r.alertas).toHaveLength(1000);
  });

  it('gemela: con el recuento igual a lo leído no hay recorte', async () => {
    const filas = Array.from({ length: 1000 }, (_, i) => filaAlerta(i));
    const { sesion } = sesionFalsa({ alertas_documentacion_nivel: { data: filas, error: null, count: 1000 } });
    expect(await leerPendientes(sesion, {})).toMatchObject({ total: 1000, recortada: false });
  });

  it('sin recuento (null) y con el tope lleno, supone recorte; con menos filas, no', async () => {
    const llena = sesionFalsa({
      alertas_documentacion_nivel: { data: Array.from({ length: 1000 }, (_, i) => filaAlerta(i)), error: null, count: null },
    });
    expect(await leerPendientes(llena.sesion, {})).toMatchObject({ recortada: true, total: 1000 });
    const corta = sesionFalsa({ alertas_documentacion_nivel: { data: [filaAlerta(1)], error: null, count: null } });
    expect(await leerPendientes(corta.sesion, {})).toMatchObject({ recortada: false, total: 1 });
  });

  it('un fallo de lectura es un fallo, no una bandeja vacía', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion } = sesionFalsa({
      alertas_documentacion_nivel: { data: null, error: { code: '42501', message: 'permission denied' } },
    });
    expect(await leerPendientes(sesion, {})).toMatchObject({ ok: false, motivo: 'no_autorizado' });
  });
});

describe('leerNombresPacientes (T-048)', () => {
  it('sin ids no consulta', async () => {
    const { sesion, from } = sesionFalsa({});
    const r = await leerNombresPacientes(sesion, []);
    expect(from).not.toHaveBeenCalled();
    expect(r.ok && r.nombres.size).toBe(0);
  });

  it('pide id, nombre y apellidos, deduplica y deja fuera el que la RLS no deja ver', async () => {
    const { sesion, from } = sesionFalsa({
      pacientes: { data: [{ id: 'p1', nombre: 'Ana', apellidos: 'García' }], error: null },
    });
    const r = await leerNombresPacientes(sesion, ['p1', 'p2', 'p1']);
    const cadena = cadenaDe(from);
    expect(cadena.select).toHaveBeenCalledWith('id, nombre, apellidos');
    expect(cadena.in).toHaveBeenCalledWith('id', ['p1', 'p2']);
    expect(r.ok && r.nombres.get('p1')).toEqual({ nombre: 'Ana', apellidos: 'García' });
    expect(r.ok && r.nombres.has('p2')).toBe(false);
  });

  it('parte en tandas de 100 como mucho', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `p${i}`);
    const { sesion, from } = sesionFalsa({ pacientes: { data: [], error: null } });
    await leerNombresPacientes(sesion, ids);
    expect(from).toHaveBeenCalledTimes(3);
    const tallas = from.mock.results.map((_, i) => (cadenaDe(from, i).in.mock.calls[0][1] as string[]).length);
    expect(tallas).toEqual([100, 100, 50]);
  });

  it('si falla una tanda, es un fallo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion } = sesionFalsa({ pacientes: { data: null, error: { code: '42501', message: 'x' } } });
    expect(await leerNombresPacientes(sesion, ['p1'])).toMatchObject({ ok: false, motivo: 'no_autorizado' });
  });
});

describe('estadoParaPunto', () => {
  it('«en curso» manda sobre el estado guardado', () => {
    expect(estadoParaPunto('confirmada', true)).toBe('en_curso');
    expect(estadoParaPunto('confirmada', false)).toBe('confirmada');
  });
});
