import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const { leerBonoDeCita, vincularBono } = await import('./acciones-bono');

const CITA = '1b2c3d4e-5f60-4a71-8b92-2d3e4f5a6b70';
const PACIENTE = '6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60';
const CENTRO = '7a2b3c4d-5e6f-4a70-9b81-1c2d3e4f5a60';
const BONO_A = '2c3d4e5f-6a71-4b82-8c93-3e4f5a6b7c80';
const BONO_B = '3d4e5f6a-7b82-4c93-8da4-4f5a6b7c8d90';

type Resultado = { data?: unknown; error?: unknown };
type FilaCita = {
  id: string;
  paciente_id: string;
  centro_id: string;
  estado: string;
  inicio: string;
  fin: string;
  bono_id: string | null;
};

// «Ahora» es el 14-10-2026 12:00 UTC; la cita por defecto es del día siguiente.
const CITA_FUTURA: FilaCita = {
  id: CITA,
  paciente_id: PACIENTE,
  centro_id: CENTRO,
  estado: 'programada',
  inicio: '2026-10-15T09:00:00Z',
  fin: '2026-10-15T10:00:00Z',
  bono_id: null,
};

function consumo(bonoId: string, totales: number, consumidas: number, caducidad: string | null = null) {
  return { bono_id: bonoId, sesiones_totales: totales, sesiones_consumidas: consumidas, caducidad };
}

/**
 * Lo justo de supabase-js: `citas.select().eq().maybeSingle()` (la cita), `bonos_consumo.select().eq()`,
 * `citas.select().in().in().neq()` (las comprometidas) y `citas.update().eq().select()`.
 */
function crearSupabaseFalso({
  cita = { data: CITA_FUTURA, error: null } as Resultado,
  zona = { data: 'Europe/Madrid', error: null } as Resultado,
  bonos = { data: [consumo(BONO_A, 5, 1)], error: null } as Resultado,
  comprometidas = { data: [], error: null } as Resultado,
  actualizar = { data: [{ id: CITA }], error: null } as Resultado,
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue(cita);
  const eqCita = vi.fn().mockReturnValue({ maybeSingle });
  const neq = vi.fn().mockResolvedValue(comprometidas);
  const inEstado = vi.fn().mockReturnValue({ neq });
  const inBono = vi.fn().mockReturnValue({ in: inEstado });
  const selectCitas = vi.fn((columnas: string) => {
    void columnas;
    return { eq: eqCita, in: inBono };
  });
  const selectActualizar = vi.fn().mockResolvedValue(actualizar);
  const eqActualizar = vi.fn().mockReturnValue({ select: selectActualizar });
  const update = vi.fn().mockReturnValue({ eq: eqActualizar });
  const eqBonos = vi.fn().mockResolvedValue(bonos);
  const selectBonos = vi.fn().mockReturnValue({ eq: eqBonos });
  const from = vi.fn((tabla: string) => {
    if (tabla === 'citas') return { select: selectCitas, update };
    if (tabla === 'bonos_consumo') return { select: selectBonos };
    throw new Error(`tabla inesperada: ${tabla}`);
  });
  const rpc = vi.fn().mockResolvedValue(zona);
  return { from, rpc, update, eqActualizar, inBono, inEstado, neq, eqBonos };
}

describe('acciones del bono de una cita', () => {
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
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: 'usr' } });
    return supabase;
  }

  describe('leerBonoDeCita', () => {
    it('una cita que no se ve (técnico, ajena): nada, sin distinguir', async () => {
      conSesion({ cita: { data: null, error: null } });
      expect(await leerBonoDeCita(CITA)).toEqual({ visible: false });
    });

    it('un id que no es uuid: nada, sin tocar la base', async () => {
      const supabase = conSesion();
      expect(await leerBonoDeCita('no-es-uuid')).toEqual({ visible: false });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('si la lectura de la cita falla: error visible, no un vacío', async () => {
      conSesion({ cita: { data: null, error: { code: 'XX000' } } });
      expect(await leerBonoDeCita(CITA)).toEqual({ visible: true, error: t('bonos.cita.errorLectura') });
    });

    it('si la lectura de bonos falla: error visible', async () => {
      conSesion({ bonos: { data: null, error: { code: 'XX000' } } });
      expect(await leerBonoDeCita(CITA)).toEqual({ visible: true, error: t('bonos.cita.errorLectura') });
    });

    it('cita sin bono con un bono vigente: editable, sin actual, con esa opción', async () => {
      conSesion();
      expect(await leerBonoDeCita(CITA)).toEqual({
        visible: true,
        editable: true,
        actual: null,
        opciones: [{ id: BONO_A, texto: 'Bono de 5 · quedan 4' }],
      });
    });

    it('sin bonos y sin bono vinculado: nada que enseñar', async () => {
      conSesion({ bonos: { data: [], error: null } });
      expect(await leerBonoDeCita(CITA)).toEqual({ visible: false });
    });

    it('un bono agotado no se ofrece', async () => {
      conSesion({ bonos: { data: [consumo(BONO_A, 5, 5)], error: null } });
      expect(await leerBonoDeCita(CITA)).toEqual({ visible: false });
    });

    it('un bono caducado en la fecha de la cita no se ofrece; vigente ese día, sí (gemela)', async () => {
      conSesion({ bonos: { data: [consumo(BONO_A, 5, 1, '2026-10-14')], error: null } });
      expect(await leerBonoDeCita(CITA)).toEqual({ visible: false });
      conSesion({ bonos: { data: [consumo(BONO_A, 5, 1, '2026-10-15')], error: null } });
      expect(await leerBonoDeCita(CITA)).toMatchObject({ visible: true, opciones: [{ id: BONO_A }] });
    });

    it('la fecha de la cita se mide en la zona del centro, no en UTC', async () => {
      // 22:30Z del 14-10 es ya el 15-10 en Madrid (UTC+2): un bono que caduca el 14 está caducado.
      conSesion({
        cita: { data: { ...CITA_FUTURA, inicio: '2026-10-14T22:30:00Z', fin: '2026-10-14T23:30:00Z' }, error: null },
        bonos: { data: [consumo(BONO_A, 5, 1, '2026-10-14')], error: null },
      });
      expect(await leerBonoDeCita(CITA)).toEqual({ visible: false });
    });

    it('un bono con todas las sesiones comprometidas por citas programadas o confirmadas no se ofrece', async () => {
      const supabase = conSesion({
        bonos: { data: [consumo(BONO_A, 3, 1)], error: null },
        comprometidas: {
          data: [
            { id: 'c1', bono_id: BONO_A },
            { id: 'c2', bono_id: BONO_A },
          ],
          error: null,
        },
      });
      expect(await leerBonoDeCita(CITA)).toEqual({ visible: false });
      // Se piden solo programada y confirmada, y nunca esta cita.
      expect(supabase.inEstado).toHaveBeenCalledWith('estado', ['programada', 'confirmada']);
      expect(supabase.neq).toHaveBeenCalledWith('id', CITA);
    });

    it('con un hueco libre sí se ofrece (gemela)', async () => {
      conSesion({
        bonos: { data: [consumo(BONO_A, 3, 1)], error: null },
        comprometidas: { data: [{ id: 'c1', bono_id: BONO_A }], error: null },
      });
      expect(await leerBonoDeCita(CITA)).toMatchObject({ visible: true, opciones: [{ id: BONO_A }] });
    });

    it('el bono ya vinculado entra siempre, aunque esté agotado, marcado como vinculado', async () => {
      conSesion({
        cita: { data: { ...CITA_FUTURA, bono_id: BONO_A }, error: null },
        bonos: { data: [consumo(BONO_A, 5, 5), consumo(BONO_B, 4, 0)], error: null },
      });
      expect(await leerBonoDeCita(CITA)).toEqual({
        visible: true,
        editable: true,
        actual: BONO_A,
        opciones: [
          { id: BONO_A, texto: 'Bono de 5 · quedan 0 (vinculado)' },
          { id: BONO_B, texto: 'Bono de 4 · quedan 4' },
        ],
      });
    });

    it('cita realizada con bono: solo lectura, sin selector', async () => {
      conSesion({ cita: { data: { ...CITA_FUTURA, estado: 'realizada', bono_id: BONO_A }, error: null } });
      expect(await leerBonoDeCita(CITA)).toEqual({
        visible: true,
        editable: false,
        actual: 'Bono de 5 · quedan 4',
      });
    });

    it('cita ya pasada con bono: solo lectura; sin bono todavía se puede vincular', async () => {
      const pasada = { inicio: '2026-10-13T09:00:00Z', fin: '2026-10-13T10:00:00Z' };
      conSesion({ cita: { data: { ...CITA_FUTURA, ...pasada, bono_id: BONO_A }, error: null } });
      expect(await leerBonoDeCita(CITA)).toMatchObject({ visible: true, editable: false });
      conSesion({ cita: { data: { ...CITA_FUTURA, ...pasada }, error: null } });
      expect(await leerBonoDeCita(CITA)).toMatchObject({ visible: true, editable: true });
    });

    it('cita cancelada sin bono: nada; con bono, solo lectura', async () => {
      conSesion({ cita: { data: { ...CITA_FUTURA, estado: 'cancelada' }, error: null } });
      expect(await leerBonoDeCita(CITA)).toEqual({ visible: false });
      conSesion({ cita: { data: { ...CITA_FUTURA, estado: 'cancelada', bono_id: BONO_A }, error: null } });
      expect(await leerBonoDeCita(CITA)).toMatchObject({ visible: true, editable: false });
    });
  });

  describe('vincularBono', () => {
    it('vincula: actualiza solo bono_id de esa cita y refresca agenda, ficha y bonos', async () => {
      const supabase = conSesion();
      const r = await vincularBono({ citaId: CITA, bonoId: BONO_A });

      expect(r).toEqual({ ok: true, mensaje: t('bonos.cita.vinculado') });
      expect(supabase.update).toHaveBeenCalledWith({ bono_id: BONO_A });
      expect(supabase.eqActualizar).toHaveBeenCalledWith('id', CITA);
      expect(revalidatePath).toHaveBeenCalledWith('/agenda');
      expect(revalidatePath).toHaveBeenCalledWith(`/pacientes/${PACIENTE}`);
      expect(revalidatePath).toHaveBeenCalledWith('/facturacion/bonos');
    });

    it('desvincula con bonoId vacío: bono_id null', async () => {
      const supabase = conSesion({ cita: { data: { ...CITA_FUTURA, bono_id: BONO_A }, error: null } });
      const r = await vincularBono({ citaId: CITA, bonoId: '' });

      expect(r).toEqual({ ok: true, mensaje: t('bonos.cita.desvinculado') });
      expect(supabase.update).toHaveBeenCalledWith({ bono_id: null });
    });

    it('entrada que no es el esquema: rechazada sin tocar la base', async () => {
      const supabase = conSesion();
      for (const mala of [null, {}, { citaId: 'x', bonoId: BONO_A }, { citaId: CITA, bonoId: 'x' }]) {
        expect(await vincularBono(mala)).toEqual({ ok: false, mensaje: t('bonos.cita.noSePudoVincular') });
      }
      expect(supabase.update).not.toHaveBeenCalled();
    });

    it('cita que no se ve: mismo mensaje, sin actualizar', async () => {
      const supabase = conSesion({ cita: { data: null, error: null } });
      expect(await vincularBono({ citaId: CITA, bonoId: BONO_A })).toEqual({
        ok: false,
        mensaje: t('bonos.cita.noSePudoVincular'),
      });
      expect(supabase.update).not.toHaveBeenCalled();
    });

    it('bono que no es de ese paciente (no sale en la lectura): rechazado sin actualizar', async () => {
      const supabase = conSesion();
      expect(await vincularBono({ citaId: CITA, bonoId: BONO_B })).toMatchObject({ ok: false });
      expect(supabase.update).not.toHaveBeenCalled();
    });

    it('bono agotado, caducado o sin hueco: rechazado sin actualizar', async () => {
      for (const bonos of [
        { data: [consumo(BONO_A, 5, 5)], error: null },
        { data: [consumo(BONO_A, 5, 1, '2026-10-01')], error: null },
      ]) {
        const supabase = conSesion({ bonos });
        expect(await vincularBono({ citaId: CITA, bonoId: BONO_A })).toMatchObject({ ok: false });
        expect(supabase.update).not.toHaveBeenCalled();
      }
      const sinHueco = conSesion({
        bonos: { data: [consumo(BONO_A, 2, 1)], error: null },
        comprometidas: { data: [{ id: 'c1', bono_id: BONO_A }], error: null },
      });
      expect(await vincularBono({ citaId: CITA, bonoId: BONO_A })).toMatchObject({ ok: false });
      expect(sinHueco.update).not.toHaveBeenCalled();
    });

    it('cita cancelada, o realizada con bono: no se cambia', async () => {
      for (const cita of [
        { ...CITA_FUTURA, estado: 'cancelada' },
        { ...CITA_FUTURA, estado: 'realizada', bono_id: BONO_A },
      ]) {
        const supabase = conSesion({ cita: { data: cita, error: null } });
        expect(await vincularBono({ citaId: CITA, bonoId: '' })).toMatchObject({ ok: false });
        expect(supabase.update).not.toHaveBeenCalled();
      }
    });

    it('la base rechaza (42501, 23514): mensaje genérico, solo el código en el registro', async () => {
      for (const code of ['42501', '23514']) {
        conSesion({ actualizar: { data: null, error: { code, message: 'detalle con datos' } } });
        expect(await vincularBono({ citaId: CITA, bonoId: BONO_A })).toEqual({
          ok: false,
          mensaje: t('bonos.cita.noSePudoVincular'),
        });
        expect(console.error).toHaveBeenLastCalledWith(expect.any(String), code);
        expect(revalidatePath).not.toHaveBeenCalled();
      }
    });

    it('UPDATE 0 filas no es éxito', async () => {
      conSesion({ actualizar: { data: [], error: null } });
      expect(await vincularBono({ citaId: CITA, bonoId: BONO_A })).toMatchObject({ ok: false });
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
