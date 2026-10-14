import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const { registrarBono } = await import('./acciones');

const PACIENTE = '6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60';
const CENTRO = '7a2b3c4d-5e6f-4a70-9b81-1c2d3e4f5a60';
const USUARIO = 'usr-sesion';
const ID = '1b2c3d4e-5f60-4a71-8b92-2d3e4f5a6b70';

type Resultado = { data?: unknown; error?: unknown };

/**
 * Lo justo de supabase-js para la acción: `pacientes.select().eq().maybeSingle()`, el `rpc` de la
 * zona y `bonos.insert()` / `bonos.select().eq().eq().maybeSingle()`. `from('cobros')` queda
 * registrado para comprobar que nunca se llama.
 */
function crearSupabaseFalso({
  paciente = { data: { centro_id: CENTRO, fusionado_en: null }, error: null } as Resultado,
  zona = { data: 'Europe/Madrid', error: null } as Resultado,
  insert = { data: null, error: null } as Resultado,
  existente = { data: null, error: null } as Resultado,
  previa = { data: null, error: null } as Resultado,
} = {}) {
  const insertar = vi.fn().mockResolvedValue(insert);
  const eq = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue(paciente) });
  const select = vi.fn().mockReturnValue({ eq });
  const eqBonos = vi.fn();
  // La primera lectura es la previa de la clave propia; las siguientes, la relectura tras el 23505.
  const maybeSingleBonos = vi.fn().mockResolvedValueOnce(previa).mockResolvedValue(existente);
  eqBonos.mockReturnValue({ eq: eqBonos, maybeSingle: maybeSingleBonos });
  const selectBonos = vi.fn().mockReturnValue({ eq: eqBonos });
  const from = vi.fn((tabla: string) => {
    if (tabla === 'bonos') return { insert: insertar, select: selectBonos };
    if (tabla === 'pacientes') return { select };
    throw new Error(`tabla inesperada: ${tabla}`);
  });
  const rpc = vi.fn().mockResolvedValue(zona);
  return { from, rpc, insertar, select, eq, selectBonos, eqBonos, maybeSingleBonos };
}

const BASE = { id: ID, pacienteId: PACIENTE, sesionesTotales: '5', importe: '150,00' };

describe('registrarBono', () => {
  beforeEach(() => {
    revalidatePath.mockReset();
    exigirSesion.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function conSesion(opciones: Parameters<typeof crearSupabaseFalso>[0] = {}) {
    const supabase = crearSupabaseFalso(opciones);
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });
    return supabase;
  }

  it('inserta el bono con la clave de envío, el importe como texto y creado_por de la sesión', async () => {
    const supabase = conSesion();

    const estado = await registrarBono({ ...BASE, caducidad: '2027-01-31' });

    expect(supabase.insertar).toHaveBeenCalledTimes(1);
    expect(supabase.insertar).toHaveBeenCalledWith({
      id: ID,
      paciente_id: PACIENTE,
      sesiones_totales: 5,
      importe: '150.00',
      caducidad: '2027-01-31',
      creado_por: USUARIO,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/facturacion/bonos');
    expect(revalidatePath).toHaveBeenCalledWith(`/pacientes/${PACIENTE}`);
    expect(estado).toEqual({ mensaje: t('bonos.bonoRegistrado') });
  });

  it('sin caducidad se guarda null', async () => {
    const supabase = conSesion();
    await registrarBono(BASE);
    expect(supabase.insertar).toHaveBeenCalledWith(expect.objectContaining({ caducidad: null }));
  });

  it('creado_por y creado_en salen de la sesión y de la base, nunca de los datos', async () => {
    const supabase = conSesion();
    await registrarBono({ ...BASE, creadoPor: 'otro', creado_por: 'otro', creado_en: 'y' });
    const fila = supabase.insertar.mock.calls[0][0];
    expect(fila.creado_por).toBe(USUARIO);
    expect(Object.keys(fila).sort()).toEqual(
      ['caducidad', 'creado_por', 'id', 'importe', 'paciente_id', 'sesiones_totales'].sort(),
    );
  });

  it('nunca toca la tabla cobros (el alta no crea un cobro)', async () => {
    const supabase = conSesion();
    await registrarBono(BASE);
    expect(supabase.from.mock.calls.map(([tabla]) => tabla)).not.toContain('cobros');
    expect(supabase.from.mock.calls.map(([tabla]) => tabla)).not.toContain('bonos_caducidades');
  });

  it.each([
    ['sesiones 0', { sesionesTotales: '0' }, 'sesionesTotales'],
    ['importe 0', { importe: '0' }, 'importe'],
    ['importe negativo', { importe: '-5' }, 'importe'],
  ])('%s: error de campo y no llega a insertar', async (_n, cambio, campo) => {
    const supabase = conSesion();
    const estado = await registrarBono({ ...BASE, ...cambio });
    expect(estado.errores?.[campo]?.length).toBeGreaterThan(0);
    expect(supabase.insertar).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('«hoy» sale de la zona del centro del paciente: en Canarias el día 15 aún es mañana', async () => {
    vi.setSystemTime(new Date('2026-10-14T22:30:00Z'));
    const supabase = conSesion({ zona: { data: 'Atlantic/Canary', error: null } });
    // 22:30 UTC: 00:30 del 15 en Madrid, 23:30 del 14 en Canarias. Caducidad = 14 vale; el cliente no manda «hoy».
    const ok = await registrarBono({ ...BASE, caducidad: '2026-10-14', hoy: '2030-01-01' });
    expect(supabase.rpc).toHaveBeenCalledWith('zona_horaria_centro', { p_centro_id: CENTRO });
    expect(ok.mensaje).toBe(t('bonos.bonoRegistrado'));

    const supabase2 = conSesion({ zona: { data: 'Europe/Madrid', error: null } });
    const ko = await registrarBono({ ...BASE, caducidad: '2026-10-14' });
    expect(ko.errores?.caducidad).toEqual([t('bonos.caducidadPasada')]);
    expect(supabase2.insertar).not.toHaveBeenCalled();
  });

  it('paciente fusionado: error en pacienteId y no inserta', async () => {
    const supabase = conSesion({ paciente: { data: { centro_id: CENTRO, fusionado_en: '2026-09-01T00:00:00Z' }, error: null } });
    const estado = await registrarBono(BASE);
    expect(estado.errores?.pacienteId).toEqual([t('bonos.pacienteFusionado')]);
    expect(supabase.insertar).not.toHaveBeenCalled();
  });

  it('paciente no visible (RLS) y 42501 dan el mismo mensaje genérico', async () => {
    const invisible = conSesion({ paciente: { data: null, error: null } });
    const a = await registrarBono(BASE);
    expect(a).toEqual({ mensaje: t('bonos.noSePudoRegistrar') });
    expect(invisible.insertar).not.toHaveBeenCalled();

    conSesion({ insert: { data: null, error: { code: '42501', message: 'x' } } });
    const b = await registrarBono(BASE);
    expect(b).toEqual(a);
  });

  it('sin clave de envío o con una que no es uuid: mensaje genérico, sin tocar la base', async () => {
    const supabase = conSesion();
    expect(await registrarBono({ ...BASE, id: undefined })).toEqual({ mensaje: t('bonos.noSePudoRegistrar') });
    expect(await registrarBono({ ...BASE, id: 'no-uuid' })).toEqual({ mensaje: t('bonos.noSePudoRegistrar') });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('una clave propia ya registrada (lectura previa): «ya registrado» sin insertar', async () => {
    const supabase = conSesion({ previa: { data: { id: ID }, error: null } });
    const estado = await registrarBono(BASE);
    expect(estado).toEqual({ mensaje: t('bonos.bonoYaRegistrado') });
    expect(supabase.insertar).not.toHaveBeenCalled();
    expect(supabase.eqBonos).toHaveBeenCalledWith('creado_por', USUARIO);
    expect(revalidatePath).toHaveBeenCalledWith('/facturacion/bonos');
  });

  describe('23505 bonos_pkey', () => {
    const duplicado = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "bonos_pkey"' } };

    it('con relectura propia: «ya registrado»', async () => {
      const supabase = conSesion({ insert: duplicado, existente: { data: { id: ID }, error: null } });
      const estado = await registrarBono(BASE);
      expect(estado).toEqual({ mensaje: t('bonos.bonoYaRegistrado') });
      expect(supabase.eqBonos).toHaveBeenCalledWith('creado_por', USUARIO);
    });

    it('sin relectura propia (el id es de otro): fallo genérico, sin decir que existe', async () => {
      conSesion({ insert: duplicado, existente: { data: null, error: null } });
      expect(await registrarBono(BASE)).toEqual({ mensaje: t('bonos.noSePudoRegistrar') });
    });

    it('relectura con error: resultado desconocido', async () => {
      conSesion({ insert: duplicado, existente: { data: null, error: { code: 'XX000' } } });
      expect(await registrarBono(BASE)).toEqual({ mensaje: t('bonos.resultadoDesconocido') });
    });
  });

  it('23514 de la base: fallo genérico', async () => {
    conSesion({ insert: { data: null, error: { code: '23514', message: 'bonos_importe_ck' } } });
    expect(await registrarBono(BASE)).toEqual({ mensaje: t('bonos.noSePudoRegistrar') });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('el registro de errores lleva solo el código, nunca importe ni paciente', async () => {
    conSesion({ insert: { data: null, error: { code: '23514', message: `importe 150 ${PACIENTE}` } } });
    await registrarBono(BASE);
    const llamadas = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(llamadas).toContain('23514');
    expect(llamadas).not.toContain(PACIENTE);
    expect(llamadas).not.toContain('150');
  });
});
