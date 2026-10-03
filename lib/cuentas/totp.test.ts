import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase/administracion', () => ({ crearClienteAdministracion: vi.fn() }));

import { regenerarCodigosRecuperacion } from './totp';
import type { Sesion } from './tipos';

const CONTRASENA = 'contrasena-que-no-debe-salir-nunca';
const DIEZ = Array.from({ length: 10 }, (_, i) => `CODIGO-${i}`);

function sesionFingida(respuesta: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({ data: respuesta.data ?? null, error: respuesta.error ?? null });
  return { sesion: { supabase: { rpc }, usuario: { id: 'u' } } as unknown as Sesion, rpc };
}

afterEach(() => vi.restoreAllMocks());

describe('regenerarCodigosRecuperacion', () => {
  it('llama al RPC por POST con la contraseña y devuelve los diez códigos', async () => {
    const { sesion, rpc } = sesionFingida({ data: [{ motivo: 'ok', bloqueado_hasta: null, codigos: DIEZ }] });

    const r = await regenerarCodigosRecuperacion(sesion, CONTRASENA);

    expect(rpc).toHaveBeenCalledTimes(1);
    // Segundo argumento ausente: ni `{ get: true }` ni nada que lo vuelva un GET con la contraseña en la URL.
    expect(rpc).toHaveBeenCalledWith('regenerar_codigos_recuperacion', { p_contrasena: CONTRASENA });
    expect(rpc.mock.calls[0]).toHaveLength(2);
    expect(r).toEqual({ ok: true, codigos: DIEZ });
  });

  it('contrasena_incorrecta no lleva códigos', async () => {
    const { sesion } = sesionFingida({
      data: [{ motivo: 'contrasena_incorrecta', bloqueado_hasta: null, codigos: null }],
    });
    expect(await regenerarCodigosRecuperacion(sesion, CONTRASENA)).toEqual({
      ok: false,
      motivo: 'contrasena_incorrecta',
    });
  });

  it('bloqueado devuelve la hora hasta la que dura', async () => {
    const hasta = '2026-10-03T10:15:00+00:00';
    const { sesion } = sesionFingida({ data: [{ motivo: 'bloqueado', bloqueado_hasta: hasta, codigos: null }] });
    expect(await regenerarCodigosRecuperacion(sesion, CONTRASENA)).toEqual({
      ok: false,
      motivo: 'bloqueado',
      bloqueadoHasta: hasta,
    });
  });

  it.each([
    ['ok con nueve códigos', [{ motivo: 'ok', bloqueado_hasta: null, codigos: DIEZ.slice(1) }]],
    ['ok sin códigos', [{ motivo: 'ok', bloqueado_hasta: null, codigos: null }]],
    ['bloqueado sin hora', [{ motivo: 'bloqueado', bloqueado_hasta: null, codigos: null }]],
    ['motivo desconocido', [{ motivo: 'otro', bloqueado_hasta: null, codigos: null }]],
    ['sin filas', []],
    ['sin datos', null],
  ])('%s es un error, nunca un éxito', async (_nombre, data) => {
    const { sesion } = sesionFingida({ data });
    const r = await regenerarCodigosRecuperacion(sesion, CONTRASENA);
    expect(r).toMatchObject({ ok: false, motivo: 'error' });
  });

  it('un error del RPC es un error y no registra la contraseña ni los argumentos', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion } = sesionFingida({ error: { code: '42501', message: 'sin segundo factor' } });

    const r = await regenerarCodigosRecuperacion(sesion, CONTRASENA);

    expect(r).toMatchObject({ ok: false, motivo: 'error' });
    expect(consola).toHaveBeenCalled();
    expect(JSON.stringify(consola.mock.calls)).not.toContain(CONTRASENA);
    expect(JSON.stringify(r)).not.toContain(CONTRASENA);
  });

  it('un éxito no registra nada en consola', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sesion } = sesionFingida({ data: [{ motivo: 'ok', bloqueado_hasta: null, codigos: DIEZ }] });

    await regenerarCodigosRecuperacion(sesion, CONTRASENA);

    expect(consola).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
