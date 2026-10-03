import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase/administracion', () => ({ crearClienteAdministracion: vi.fn() }));

import { regenerarCodigosRecuperacion } from './totp';
import type { Sesion } from './tipos';

const CONTRASENA = 'contrasena-que-no-debe-salir-nunca';
const DIEZ = Array.from({ length: 10 }, (_, i) => `CODIGO-${i}`);

/**
 * Dos RPC (A-H1): `comprobar_contrasena_para_regenerar` (paso uno, devuelve void) y
 * `regenerar_codigos_recuperacion` (paso dos). `respuesta` es la del paso dos;
 * `comprobacion` la del paso uno.
 */
function sesionFingida(
  respuesta: { data?: unknown; error?: unknown },
  comprobacion: { error?: unknown } = {},
) {
  const rpc = vi.fn().mockImplementation(async (nombre: string) =>
    nombre === 'comprobar_contrasena_para_regenerar'
      ? { data: null, error: comprobacion.error ?? null }
      : { data: respuesta.data ?? null, error: respuesta.error ?? null },
  );
  return { sesion: { supabase: { rpc }, usuario: { id: 'u' } } as unknown as Sesion, rpc };
}

afterEach(() => vi.restoreAllMocks());

describe('regenerarCodigosRecuperacion', () => {
  it('llama a dos RPC por POST, la contraseña solo en la primera, y devuelve los diez códigos', async () => {
    const { sesion, rpc } = sesionFingida({ data: [{ motivo: 'ok', bloqueado_hasta: null, codigos: DIEZ }] });

    const r = await regenerarCodigosRecuperacion(sesion, CONTRASENA);

    expect(rpc).toHaveBeenCalledTimes(2);
    // Segundo argumento ausente en el paso uno: ni `{ get: true }` ni nada que lo vuelva un GET con la contraseña en la URL.
    expect(rpc.mock.calls[0]).toEqual(['comprobar_contrasena_para_regenerar', { p_contrasena: CONTRASENA }]);
    // El paso dos no lleva argumentos: ni la contraseña ni un perfil.
    expect(rpc.mock.calls[1]).toEqual(['regenerar_codigos_recuperacion']);
    expect(r).toEqual({ ok: true, codigos: DIEZ });
  });

  it('si el paso uno falla, es un error y no se llama al paso dos', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion, rpc } = sesionFingida(
      { data: [{ motivo: 'ok', bloqueado_hasta: null, codigos: DIEZ }] },
      { error: { code: '42501', message: 'sin segundo factor' } },
    );

    const r = await regenerarCodigosRecuperacion(sesion, CONTRASENA);

    expect(r).toMatchObject({ ok: false, motivo: 'error' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(consola.mock.calls)).not.toContain(CONTRASENA);
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
