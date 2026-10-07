import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const { registrarCobro } = await import('./acciones');

const PACIENTE = '6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60';
const CENTRO = '7a2b3c4d-5e6f-4a70-9b81-1c2d3e4f5a60';
const USUARIO = 'usr-sesion';
const ID = '1b2c3d4e-5f60-4a71-8b92-2d3e4f5a6b70';

type Resultado = { data?: unknown; error?: unknown };

/**
 * Lo justo de supabase-js para la acción: `pacientes.select().eq().maybeSingle()`, el `rpc` de la
 * zona y `cobros.insert()`. Cada llamada queda registrada para comprobar qué se mandó.
 */
function crearSupabaseFalso({
  paciente = { data: { centro_id: CENTRO, fusionado_en: null }, error: null } as Resultado,
  zona = { data: 'Europe/Madrid', error: null } as Resultado,
  insert = { data: null, error: null } as Resultado,
  existente = { data: null, error: null } as Resultado,
} = {}) {
  const insertar = vi.fn().mockResolvedValue(insert);
  const eq = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue(paciente) });
  const select = vi.fn().mockReturnValue({ eq });
  // cobros.select('id').eq('id', …).eq('registrado_por', …).maybeSingle(): la relectura tras un 23505.
  const eqCobros = vi.fn();
  const maybeSingleCobros = vi.fn().mockResolvedValue(existente);
  eqCobros.mockReturnValue({ eq: eqCobros, maybeSingle: maybeSingleCobros });
  const selectCobros = vi.fn().mockReturnValue({ eq: eqCobros });
  const from = vi.fn((tabla: string) =>
    tabla === 'cobros' ? { insert: insertar, select: selectCobros } : { select },
  );
  const rpc = vi.fn().mockResolvedValue(zona);
  return { from, rpc, insertar, select, eq, selectCobros, eqCobros };
}

const BASE = {
  id: ID,
  pacienteId: PACIENTE,
  importe: '60,00',
  fecha: '2026-10-06',
  formaPago: 'transferencia',
};

describe('registrarCobro', () => {
  beforeEach(() => {
    revalidatePath.mockReset();
    exigirSesion.mockReset();
    // Mediodía en UTC: el mismo día en Madrid y en Canarias.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('una devolución de -20,00 con motivo se inserta en negativo, con el motivo, el id de la clave de envío y sin registrado_en', async () => {
    const supabase = crearSupabaseFalso();
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

    const estado = await registrarCobro({ ...BASE, importe: '-20,00', motivo: 'Sesión cobrada dos veces' });

    expect(supabase.insertar).toHaveBeenCalledTimes(1);
    expect(supabase.insertar).toHaveBeenCalledWith({
      id: ID,
      paciente_id: PACIENTE,
      importe: '-20.00',
      fecha: '2026-10-06',
      forma_pago: 'transferencia',
      referencia: null,
      motivo: 'Sesión cobrada dos veces',
      registrado_por: USUARIO,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/facturacion');
    expect(estado).toEqual({ mensaje: t('cobros.cobroRegistrado') });
  });

  it('una devolución sin motivo es un error de campo y no llega a insertar', async () => {
    const supabase = crearSupabaseFalso();
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

    const estado = await registrarCobro({ ...BASE, importe: '-20,00' });

    expect(estado.errores?.motivo).toEqual([t('cobros.devolucionNecesitaMotivo')]);
    expect(supabase.insertar).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('un motivo mandado con un importe positivo se guarda null', async () => {
    const supabase = crearSupabaseFalso();
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

    await registrarCobro({ ...BASE, importe: '1.234,56', motivo: 'no debería guardarse', referencia: 'TR-9' });

    expect(supabase.insertar).toHaveBeenCalledWith(
      expect.objectContaining({ importe: '1234.56', motivo: null, referencia: 'TR-9' }),
    );
  });

  it('registrado_por sale de la sesión, nunca de los datos', async () => {
    const supabase = crearSupabaseFalso();
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

    await registrarCobro({ ...BASE, registradoPor: 'otro', registrado_por: 'otro', registrado_en: 'y' });

    const fila = supabase.insertar.mock.calls[0][0];
    expect(fila.registrado_por).toBe(USUARIO);
    expect(Object.keys(fila).sort()).toEqual(
      ['fecha', 'forma_pago', 'id', 'importe', 'motivo', 'paciente_id', 'referencia', 'registrado_por'].sort(),
    );
  });

  describe('«hoy» sale de la zona del centro del paciente, calculada en el servidor', () => {
    // 22:30 UTC del 6 de octubre: las 00:30 del 7 en Madrid y las 23:30 del 6 en Canarias.
    beforeEach(() => vi.setSystemTime(new Date('2026-10-06T22:30:00Z')));

    it('con un centro en Atlantic/Canary, el 7 todavía es mañana y se rechaza en el campo fecha', async () => {
      const supabase = crearSupabaseFalso({ zona: { data: 'Atlantic/Canary', error: null } });
      exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

      const estado = await registrarCobro({ ...BASE, fecha: '2026-10-07', hoy: '2030-01-01' });

      expect(supabase.eq).toHaveBeenCalledWith('id', PACIENTE);
      expect(supabase.rpc).toHaveBeenCalledWith('zona_horaria_centro', { p_centro_id: CENTRO });
      expect(estado.errores?.fecha).toEqual([t('cobros.fechaFutura')]);
      expect(supabase.insertar).not.toHaveBeenCalled();
    });

    it('gemela: con el centro en Europe/Madrid, el 7 ya es hoy y se inserta', async () => {
      const supabase = crearSupabaseFalso({ zona: { data: 'Europe/Madrid', error: null } });
      exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

      const estado = await registrarCobro({ ...BASE, fecha: '2026-10-07' });

      expect(supabase.insertar).toHaveBeenCalledWith(expect.objectContaining({ fecha: '2026-10-07' }));
      expect(estado).toEqual({ mensaje: t('cobros.cobroRegistrado') });
    });
  });

  it('un pacienteId que no es uuid es un error de campo y no consulta nada', async () => {
    const supabase = crearSupabaseFalso();
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

    const estado = await registrarCobro({ ...BASE, pacienteId: 'Ana García' });

    expect(estado.errores?.pacienteId).toBeDefined();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('un paciente que la RLS no deja ver da el mensaje genérico, igual que un 42501: sin oráculo', async () => {
    const supabase = crearSupabaseFalso({ paciente: { data: null, error: null } });
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

    const estado = await registrarCobro(BASE);

    expect(estado).toEqual({ mensaje: t('cobros.noSePudoRegistrar') });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.insertar).not.toHaveBeenCalled();
  });

  it('un paciente fusionado se rechaza en el campo pacienteId y no llega a insertar; lee fusionado_en', async () => {
    const supabase = crearSupabaseFalso({
      paciente: { data: { centro_id: CENTRO, fusionado_en: '2026-09-30T10:00:00Z' }, error: null },
    });
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

    const estado = await registrarCobro(BASE);

    expect(estado).toEqual({ errores: { pacienteId: [t('cobros.pacienteFusionado')] } });
    expect(supabase.select).toHaveBeenCalledWith('centro_id, fusionado_en');
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.insertar).not.toHaveBeenCalled();
  });

  it('gemela: un paciente con fusionado_en null sí se inserta', async () => {
    const supabase = crearSupabaseFalso({
      paciente: { data: { centro_id: CENTRO, fusionado_en: null }, error: null },
    });
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

    const estado = await registrarCobro(BASE);

    expect(estado).toEqual({ mensaje: t('cobros.cobroRegistrado') });
    expect(supabase.insertar).toHaveBeenCalledTimes(1);
  });

  it('el 23514 del disparador de la fecha vuelve como error del campo fecha', async () => {
    const supabase = crearSupabaseFalso({
      insert: {
        data: null,
        error: { code: '23514', message: 'La fecha de un cobro no puede ser posterior a hoy (fecha del centro) (T-023)' },
      },
    });
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

    const estado = await registrarCobro(BASE);

    expect(estado.errores?.fecha).toEqual([t('cobros.fechaFutura')]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('el 23514 de cobros_devolucion_motivo_ck vuelve como error del campo motivo', async () => {
    const supabase = crearSupabaseFalso({
      insert: {
        data: null,
        error: {
          code: '23514',
          message: 'new row for relation "cobros" violates check constraint "cobros_devolucion_motivo_ck"',
        },
      },
    });
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

    const estado = await registrarCobro({ ...BASE, importe: '-5', motivo: 'x' });

    expect(estado.errores?.motivo).toEqual([t('cobros.devolucionNecesitaMotivo')]);
  });

  it('un 42501 da el mensaje genérico y el registro lleva el código, sin importe ni paciente', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = crearSupabaseFalso({
      insert: { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } },
    });
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

    const estado = await registrarCobro({ ...BASE, importe: '77,77' });

    expect(estado).toEqual({ mensaje: t('cobros.noSePudoRegistrar') });
    expect(revalidatePath).not.toHaveBeenCalled();
    const registrado = JSON.stringify(consola.mock.calls);
    expect(registrado).toContain('42501');
    expect(registrado).not.toContain('77');
    expect(registrado).not.toContain(PACIENTE);
  });

  describe('R3.1: clave de envío', () => {
    it.each([
      ['sin id', undefined],
      ['con un id que no es UUID', 'x'],
      ['con un id numérico', 7],
    ])('%s: mensaje genérico y no llega a insertar', async (_nombre, id) => {
      const supabase = crearSupabaseFalso();
      exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

      const estado = await registrarCobro({ ...BASE, id });

      expect(estado).toEqual({ mensaje: t('cobros.noSePudoRegistrar') });
      expect(supabase.insertar).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('un 23505 de cobros_pkey con el cobro propio ya registrado es éxito, sin duplicar', async () => {
      const supabase = crearSupabaseFalso({
        insert: {
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint "cobros_pkey"' },
        },
        existente: { data: { id: ID }, error: null },
      });
      exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

      const estado = await registrarCobro(BASE);

      expect(estado).toEqual({ mensaje: t('cobros.cobroRegistrado') });
      expect(revalidatePath).toHaveBeenCalledWith('/facturacion');
      expect(supabase.selectCobros).toHaveBeenCalledWith('id');
      expect(supabase.eqCobros).toHaveBeenCalledWith('id', ID);
      expect(supabase.eqCobros).toHaveBeenCalledWith('registrado_por', USUARIO);
    });

    it('un 23505 de cobros_pkey sin fila propia visible es el mensaje genérico', async () => {
      const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
      const supabase = crearSupabaseFalso({
        insert: { data: null, error: { code: '23505', message: 'duplicate key … "cobros_pkey"' } },
        existente: { data: null, error: null },
      });
      exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

      const estado = await registrarCobro(BASE);

      expect(estado).toEqual({ mensaje: t('cobros.noSePudoRegistrar') });
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(consola).toHaveBeenCalled();
    });

    it('un 23505 de cobros_pkey con error al releer es el mensaje genérico', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const supabase = crearSupabaseFalso({
        insert: { data: null, error: { code: '23505', message: 'duplicate key … "cobros_pkey"' } },
        existente: { data: null, error: { code: '42501', message: 'rls' } },
      });
      exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

      const estado = await registrarCobro(BASE);

      expect(estado).toEqual({ mensaje: t('cobros.noSePudoRegistrar') });
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('un 23505 de otra restricción es el mensaje genérico y no relee', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const supabase = crearSupabaseFalso({
        insert: { data: null, error: { code: '23505', message: 'duplicate key … "otra_ukey"' } },
        existente: { data: { id: ID }, error: null },
      });
      exigirSesion.mockResolvedValue({ supabase, usuario: { id: USUARIO } });

      const estado = await registrarCobro(BASE);

      expect(estado).toEqual({ mensaje: t('cobros.noSePudoRegistrar') });
      expect(supabase.selectCobros).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
