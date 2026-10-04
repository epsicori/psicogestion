import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  exigirSesion: vi.fn(),
  leerBloques: vi.fn(),
  leerUltimasCitasPaciente: vi.fn(),
  previsualizarAlta: vi.fn(),
  crearCitaSuelta: vi.fn(),
  crearSerieAlta: vi.fn(),
  zonaDeCentro: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }));
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: m.exigirSesion }));
vi.mock('@/lib/citas/agenda', () => ({ zonaDeCentro: m.zonaDeCentro }));
vi.mock('@/lib/citas/alta', () => ({
  leerBloques: m.leerBloques,
  leerUltimasCitasPaciente: m.leerUltimasCitasPaciente,
  previsualizarAlta: m.previsualizarAlta,
  crearCitaSuelta: m.crearCitaSuelta,
  crearSerieAlta: m.crearSerieAlta,
}));

import { buscarPacientes, guardarAlta, previsualizarAltaSerie, recalcularAlta } from './acciones';

const PACIENTE = '11111111-1111-4111-8111-111111111111';
const PROFESIONAL = '22222222-2222-4222-8222-222222222222';
const CENTRO = '33333333-3333-4333-8333-333333333333';
const TIPO = '44444444-4444-4444-8444-444444444444';
const YO = '55555555-5555-4555-8555-555555555555';
const NOMBRE_TIPO = 'Sesión de pareja';
const FIRMA = 'a'.repeat(64);

type Tablas = {
  rol?: string | null;
  tipo?: { id: string; nombre: string; duracion_minutos: number } | null;
  pacientes?: { id: string; nombre: string; apellidos: string; profesional_id?: string | null }[];
};

/** Un cliente que contesta por tabla y recuerda cada llamada. */
function clienteFalso(tablas: Tablas) {
  const llamadas: Record<string, (...args: unknown[]) => void> = {};
  const cadena = (tabla: string) => {
    const c: Record<string, unknown> = {};
    for (const metodo of ['select', 'eq', 'or', 'order', 'limit', 'ilike']) {
      llamadas[`${tabla}.${metodo}`] ??= vi.fn();
      c[metodo] = (...args: unknown[]) => {
        llamadas[`${tabla}.${metodo}`](...args);
        return c;
      };
    }
    c.maybeSingle = async () => {
      if (tabla === 'perfiles') return { data: tablas.rol === null ? null : { rol: tablas.rol ?? 'profesional_sanitario' }, error: null };
      if (tabla === 'tipos_terapia') {
        return { data: tablas.tipo === undefined ? { id: TIPO, nombre: NOMBRE_TIPO, duracion_minutos: 80 } : tablas.tipo, error: null };
      }
      return { data: null, error: null };
    };
    c.then = (resolver: (r: unknown) => unknown) => Promise.resolve({ data: tablas.pacientes ?? [], error: null }).then(resolver);
    return c;
  };
  return { from: vi.fn(cadena), llamadas };
}

function prepara(tablas: Tablas = {}) {
  const cliente = clienteFalso(tablas);
  m.exigirSesion.mockResolvedValue({ supabase: cliente, usuario: { id: YO } });
  return cliente;
}

const BLOQUES = [
  { fecha: '2026-10-06', horaLocal: '17:00', inicio: '2026-10-06T15:00:00.000Z', fin: '2026-10-06T15:50:00.000Z', estado: 'libre' },
  { fecha: '2026-10-07', horaLocal: '10:00', inicio: '2026-10-07T08:00:00.000Z', fin: '2026-10-07T08:50:00.000Z', estado: 'libre' },
  { fecha: '2026-10-08', horaLocal: '10:00', inicio: '2026-10-08T08:00:00.000Z', fin: '2026-10-08T08:50:00.000Z', estado: 'libre' },
];

const suelta = {
  pacienteId: PACIENTE,
  profesionalId: PROFESIONAL,
  centroId: CENTRO,
  tipoTerapiaId: TIPO,
  fecha: '2026-10-06',
  horaLocal: '17:00',
  periodicidad: 'suelta',
  sesionesTotales: null,
  sala: null,
  notaOperativa: 'Traer el informe',
  excluir: [],
  aceptarAlternativas: [],
  firma: null,
};

const serie = { ...suelta, periodicidad: 'semanal', sesionesTotales: 8, firma: FIRMA };

const previaVacia = { zonaHoraria: 'Europe/Madrid', sesiones: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-04T10:00:00Z'));
  m.zonaDeCentro.mockResolvedValue({ ok: true, zona: 'Europe/Madrid' });
  m.leerBloques.mockResolvedValue({ ok: true, bloques: BLOQUES });
  m.leerUltimasCitasPaciente.mockResolvedValue({ ok: true, citas: [] });
  m.crearCitaSuelta.mockResolvedValue({ ok: true, citaId: 'c1' });
  m.crearSerieAlta.mockResolvedValue({ ok: true, serieId: 's1', citaIds: ['c1', 'c2'], propuestasPendientes: [] });
  m.previsualizarAlta.mockResolvedValue({ ok: true, previa: previaVacia, firma: FIRMA });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('guardarAlta · quién decide qué', () => {
  it('el técnico elige el tipo, la duración sale del catálogo y su nota se anula (ADR-074, E1.5)', async () => {
    prepara({ rol: 'tecnico_administrativo', tipo: { id: TIPO, nombre: NOMBRE_TIPO, duracion_minutos: 80 } });

    const r = await guardarAlta({ ...suelta, duracionMinutos: 5 });

    expect(r).toMatchObject({ ok: true });
    expect(m.crearCitaSuelta).toHaveBeenCalledOnce();
    expect(m.crearCitaSuelta.mock.calls[0][1]).toMatchObject({ tipoTerapiaId: TIPO, duracionMinutos: 80, notaOperativa: null });
  });

  it('el profesional agenda siempre a su nombre, diga lo que diga el formulario', async () => {
    prepara({ rol: 'profesional_sanitario' });

    await guardarAlta(suelta);

    expect(m.crearCitaSuelta.mock.calls[0][1]).toMatchObject({ profesionalId: YO, notaOperativa: 'Traer el informe' });
  });

  it('el administrador elige profesional y conserva su nota', async () => {
    prepara({ rol: 'administrador' });

    await guardarAlta(suelta);

    expect(m.crearCitaSuelta.mock.calls[0][1]).toMatchObject({ profesionalId: PROFESIONAL, notaOperativa: 'Traer el informe' });
  });

  it('un tipo que no está en el catálogo activo no guarda nada', async () => {
    prepara({ tipo: null });

    const r = await guardarAlta(suelta);

    expect(r).toMatchObject({ ok: false, motivo: 'tipo_no_valido' });
    expect(m.crearCitaSuelta).not.toHaveBeenCalled();
  });

  it('sin perfil legible no se guarda: no_autorizado', async () => {
    prepara({ rol: null });

    const r = await guardarAlta(suelta);

    expect(r).toMatchObject({ ok: false, motivo: 'no_autorizado' });
    expect(m.crearCitaSuelta).not.toHaveBeenCalled();
  });

  it('un formulario que no pasa el esquema no llega a la base', async () => {
    prepara();

    const r = await guardarAlta({ ...suelta, tipoTerapiaId: null });

    expect(r).toMatchObject({ ok: false, motivo: 'parametro_invalido', mensaje: 'Elige un tipo de terapia.' });
    expect(m.crearCitaSuelta).not.toHaveBeenCalled();
  });
});

describe('guardarAlta · lo que vuelve', () => {
  it('con éxito revalida la agenda y la ficha del paciente y dice qué día abrir', async () => {
    prepara();

    const r = await guardarAlta(suelta);

    expect(r).toEqual({ ok: true, anuncio: 'Cita guardada.', fecha: '2026-10-06' });
    expect(m.revalidatePath).toHaveBeenCalledWith('/agenda');
    expect(m.revalidatePath).toHaveBeenCalledWith('/pacientes/[id]', 'page');
  });

  it('el hueco ocupado vuelve con la vista recalculada sin ese hueco y no revalida', async () => {
    prepara();
    m.crearCitaSuelta.mockResolvedValue({ ok: false, motivo: 'hueco_ocupado', mensaje: 'x' });

    const r = await guardarAlta(suelta);

    expect(r).toMatchObject({ ok: false, motivo: 'hueco_ocupado', mensaje: 'Ese hueco acaba de ocuparse. Elige otro de los que quedan.' });
    if (r.ok || !('vista' in r) || !r.vista) throw new Error('se esperaba hueco_ocupado con vista');
    const claves = r.vista.tarjetas.map((t: { clave: string }) => t.clave);
    expect(claves).not.toContain('2026-10-06T17:00');
    expect(claves).toContain('2026-10-07T10:00');
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it('una serie cuya firma cambió no se crea y enseña la serie de nuevo', async () => {
    prepara();
    m.previsualizarAlta.mockResolvedValue({ ok: true, previa: previaVacia, firma: 'b'.repeat(64) });

    const r = await guardarAlta(serie);

    expect(r).toMatchObject({ ok: false, motivo: 'previsualizacion_caducada', sesiones: [], firma: 'b'.repeat(64) });
    expect(m.crearSerieAlta).not.toHaveBeenCalled();
  });

  it('una serie con la firma que se enseñó se crea con la duración del catálogo', async () => {
    prepara({ rol: 'administrador' });

    const r = await guardarAlta({ ...serie, excluir: ['2026-10-13'], aceptarAlternativas: ['2026-10-20'] });

    expect(r).toEqual({ ok: true, anuncio: 'Serie guardada.', fecha: '2026-10-06' });
    expect(m.crearSerieAlta.mock.calls[0][1]).toMatchObject({
      periodicidad: 'semanal',
      diaSemana: 2,
      duracionMinutos: 80,
      sesionesTotales: 8,
      excluir: ['2026-10-13'],
      aceptarAlternativas: ['2026-10-20'],
    });
  });

  it('si quedan propuestas sin resolver, el anuncio lo dice', async () => {
    prepara();
    m.crearSerieAlta.mockResolvedValue({
      ok: true,
      serieId: 's1',
      citaIds: ['c1'],
      propuestasPendientes: [{ fecha: '2026-10-13', motivo: 'festivo' }],
    });

    const r = await guardarAlta(serie);

    expect(r).toEqual({ ok: true, anuncio: 'Serie guardada. Quedan fechas por resolver en la bandeja de la agenda.', fecha: '2026-10-06' });
  });

  it('ningún resultado lleva el uuid ni el nombre del tipo (ADR-074.2)', async () => {
    prepara({ rol: 'tecnico_administrativo', tipo: { id: TIPO, nombre: NOMBRE_TIPO, duracion_minutos: 80 } });
    m.crearCitaSuelta.mockResolvedValueOnce({ ok: false, motivo: 'hueco_ocupado', mensaje: 'x' });
    m.previsualizarAlta.mockResolvedValueOnce({ ok: true, previa: previaVacia, firma: 'b'.repeat(64) });

    const resultados = [
      await guardarAlta(suelta),
      await guardarAlta(suelta),
      await guardarAlta(serie),
      await recalcularAlta({ pacienteId: PACIENTE, profesionalId: PROFESIONAL, centroId: CENTRO, tipoTerapiaId: TIPO, fechaFoco: null, excluir: [] }),
      await previsualizarAltaSerie({ ...serie, firma: undefined }),
    ];

    for (const r of resultados) {
      const texto = JSON.stringify(r);
      expect(texto).not.toContain(TIPO);
      expect(texto).not.toContain(NOMBRE_TIPO);
    }
  });
});

describe('recalcularAlta', () => {
  const entrada = { pacienteId: PACIENTE, profesionalId: PROFESIONAL, centroId: CENTRO, tipoTerapiaId: null, fechaFoco: null, excluir: [] };

  it('sin tipo usa la duración inicial de 50; con tipo, la del catálogo', async () => {
    prepara({ tipo: { id: TIPO, nombre: NOMBRE_TIPO, duracion_minutos: 80 } });

    await recalcularAlta(entrada);
    expect(m.leerBloques.mock.calls[0][1]).toMatchObject({ duracionMinutos: 50 });

    m.leerBloques.mockClear();
    const r = await recalcularAlta({ ...entrada, tipoTerapiaId: TIPO });
    expect(m.leerBloques.mock.calls[0][1]).toMatchObject({ duracionMinutos: 80 });
    expect(r).toMatchObject({ ok: true, duracionMinutos: 80 });
  });

  it('un tipo que no existe no se sustituye en silencio por 50: tipo_no_valido', async () => {
    prepara({ tipo: null });

    expect(await recalcularAlta({ ...entrada, tipoTerapiaId: TIPO })).toMatchObject({ ok: false, motivo: 'tipo_no_valido' });
  });

  it('el profesional calcula siempre sobre su propia agenda', async () => {
    prepara({ rol: 'profesional_sanitario' });

    await recalcularAlta(entrada);

    expect(m.leerBloques.mock.calls[0][1]).toMatchObject({ profesionalId: YO });
    expect(m.leerUltimasCitasPaciente.mock.calls[0][2]).toMatchObject({ profesionalId: YO });
  });

  it('devuelve el calendario de la semana pedida y las tarjetas, y las excluidas no salen', async () => {
    prepara();

    const r = await recalcularAlta({ ...entrada, fechaFoco: '2026-10-07', excluir: ['2026-10-06T17:00'] });

    if (!r.ok) throw new Error('se esperaba ok');
    expect(r.vista.calendario.desde).toBe('2026-10-05');
    expect(r.vista.tarjetas.map((t) => t.clave)).toEqual(['2026-10-07T10:00', '2026-10-08T10:00']);
    expect(r.vista.errorSugerencias).toBe(false);
  });

  it('un fallo de sugerencias no tumba el calendario: errorSugerencias y el resto sigue', async () => {
    prepara();
    // Una cita pasada con un instante imposible hace lanzar al cálculo de sugerencias.
    m.leerUltimasCitasPaciente.mockResolvedValue({ ok: true, citas: [{ inicio: 'no es una fecha', zonaHoraria: 'Europe/Madrid' }] });

    const r = await recalcularAlta({ ...entrada, fechaFoco: '2026-10-07' });

    if (!r.ok) throw new Error('se esperaba ok');
    expect(r.vista.errorSugerencias).toBe(true);
    expect(r.vista.tarjetas).toEqual([]);
    expect(r.vista.calendario.huecos).toHaveLength(3);
  });

  it('si la base falla al leer bloques, mensaje y no excepción', async () => {
    prepara();
    m.leerBloques.mockResolvedValue({ ok: false, motivo: 'no_autorizado', mensaje: 'No tienes permiso.' });

    expect(await recalcularAlta(entrada)).toMatchObject({ ok: false, mensaje: 'No tienes permiso.' });
  });
});

describe('previsualizarAltaSerie', () => {
  it('manda a la base la duración del catálogo y el día de la semana de la fecha', async () => {
    prepara({ rol: 'administrador' });

    const r = await previsualizarAltaSerie(serie);

    expect(r).toEqual({ ok: true, sesiones: [], firma: FIRMA });
    expect(m.previsualizarAlta.mock.calls[0][1]).toMatchObject({
      duracionMinutos: 80,
      diaSemana: 2,
      horaLocal: '17:00',
      desde: '2026-10-06',
      sesionesTotales: 8,
      periodicidad: 'semanal',
    });
  });

  it('no previsualiza una cita suelta', async () => {
    prepara();

    expect(await previsualizarAltaSerie({ ...serie, periodicidad: 'suelta' })).toMatchObject({ ok: false });
    expect(m.previsualizarAlta).not.toHaveBeenCalled();
  });
});

describe('buscarPacientes', () => {
  it('con menos de dos caracteres no consulta', async () => {
    const cliente = prepara();

    expect(await buscarPacientes({ texto: 'a' })).toMatchObject({ ok: false });
    expect(cliente.from).not.toHaveBeenCalledWith('pacientes');
  });

  it('devuelve como mucho diez, solo id y nombre, y el filtro no deja pasar comodines ni comas', async () => {
    const cliente = prepara({
      pacientes: [{ id: PACIENTE, nombre: 'Ana', apellidos: 'Pérez', profesional_id: PROFESIONAL }],
    });

    const r = await buscarPacientes({ texto: ' an%,(a) ' });

    // El profesional asignado viaja para proponerlo por defecto (H9); nada clínico más.
    expect(r).toEqual({ ok: true, pacientes: [{ id: PACIENTE, nombre: 'Ana Pérez', profesionalId: PROFESIONAL }] });
    expect(cliente.llamadas['pacientes.limit']).toHaveBeenCalledWith(10);
    expect(cliente.llamadas['pacientes.select']).toHaveBeenCalledWith('id, nombre, apellidos, profesional_id');
    expect(cliente.llamadas['pacientes.or']).toHaveBeenCalledWith('nombre.ilike.%ana%,apellidos.ilike.%ana%');
  });
});
