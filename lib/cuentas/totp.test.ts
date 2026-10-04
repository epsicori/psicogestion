import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase/administracion', () => ({ crearClienteAdministracion: vi.fn() }));

import { canjearCodigoRecuperacion, generarCodigosRecuperacion, regenerarCodigosRecuperacion } from './totp';
import { crearClienteAdministracion } from '../supabase/administracion';
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

describe('generarCodigosRecuperacion · B2-H5', () => {
  it('un 42501 (segundo factor de hace más de cinco minutos) marca que la salida es volver a entrar', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion } = sesionFingida({ error: { code: '42501', message: 'sin segundo factor reciente' } });

    const r = await generarCodigosRecuperacion(sesion);

    expect(r).toMatchObject({ ok: false, reentrar: true });
    consola.mockRestore();
  });

  it('cualquier otro fallo no marca reentrar: reintentar sí puede funcionar', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion } = sesionFingida({ error: { code: '57014', message: 'timeout' } });

    const r = await generarCodigosRecuperacion(sesion);

    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('reentrar');
    consola.mockRestore();
  });
});

describe('canjearCodigoRecuperacion · dos pasos (T-042)', () => {
  const CODIGO = 'CODIGO-SECRETO-1234';
  const sesionCanje = (paso2: { data?: unknown; error?: unknown }, paso1: { error?: unknown } = {}) => {
    const rpc = vi.fn().mockImplementation(async (nombre: string) =>
      nombre === 'comprobar_codigo_recuperacion'
        ? { data: null, error: paso1.error ?? null }
        : { data: paso2.data ?? null, error: paso2.error ?? null },
    );
    return { sesion: { supabase: { rpc }, usuario: { id: 'u-1' } } as unknown as Sesion, rpc };
  };
  const adminFingida = () => {
    const listFactors = vi.fn().mockResolvedValue({ data: { factors: [] }, error: null });
    vi.mocked(crearClienteAdministracion).mockReturnValue({
      auth: { admin: { mfa: { listFactors, deleteFactor: vi.fn() } } },
    } as never);
    return listFactors;
  };

  it('llama a dos RPC: el código solo en la primera, la segunda sin argumentos, y la Admin API solo con ok', async () => {
    const listFactors = adminFingida();
    const { sesion, rpc } = sesionCanje({ data: [{ canjeado: true, motivo: 'ok', bloqueado_hasta: null }] });

    const r = await canjearCodigoRecuperacion(sesion, CODIGO);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(['comprobar_codigo_recuperacion', { p_codigo: CODIGO }]);
    expect(rpc.mock.calls[1]).toEqual(['canjear_codigo_recuperacion']);
    expect(r).toEqual({ canjeado: true, motivo: 'ok', bloqueadoHasta: null });
    expect(listFactors).toHaveBeenCalledTimes(1);
  });

  it('codigo_invalido y bloqueado no tocan la Admin API', async () => {
    const listFactors = adminFingida();
    const a = sesionCanje({ data: [{ canjeado: false, motivo: 'codigo_invalido', bloqueado_hasta: null }] });
    expect(await canjearCodigoRecuperacion(a.sesion, CODIGO)).toMatchObject({ canjeado: false, motivo: 'codigo_invalido' });
    const hasta = '2026-10-09T10:15:00Z';
    const b = sesionCanje({ data: [{ canjeado: false, motivo: 'bloqueado', bloqueado_hasta: hasta }] });
    expect(await canjearCodigoRecuperacion(b.sesion, CODIGO)).toMatchObject({ motivo: 'bloqueado', bloqueadoHasta: hasta });
    expect(listFactors).not.toHaveBeenCalled();
  });

  it('si el paso uno falla, es un error: sin paso dos, sin Admin API y sin el código en consola', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listFactors = adminFingida();
    const { sesion, rpc } = sesionCanje(
      { data: [{ canjeado: true, motivo: 'ok', bloqueado_hasta: null }] },
      { error: { code: '25006', message: `codigo ${CODIGO}` } },
    );

    const r = await canjearCodigoRecuperacion(sesion, CODIGO);

    expect(r).toEqual({ canjeado: false, motivo: 'error', bloqueadoHasta: null });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(listFactors).not.toHaveBeenCalled();
    expect(JSON.stringify(consola.mock.calls)).not.toContain(CODIGO);
  });

  it('si el paso dos falla, es un error y no se toca la Admin API', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const listFactors = adminFingida();
    const { sesion } = sesionCanje({ error: { code: '57014', message: 'timeout' } });
    expect(await canjearCodigoRecuperacion(sesion, CODIGO)).toMatchObject({ canjeado: false, motivo: 'error' });
    expect(listFactors).not.toHaveBeenCalled();
  });
});
