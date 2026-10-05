import { beforeEach, describe, expect, it, vi } from 'vitest';

import { darAltaCentro, mensajeDeErrorDeAlta, retirarAltaCentro } from './altas';
import type { Sesion } from './tipos';

/**
 * T-041 (diseño P5 y P12). Quién puede dar o retirar un alta lo decide la RPC y se prueba en
 * `scripts/rls/28-altas-de-centro.sql`. Aquí, lo que decide este fichero: los argumentos
 * exactos de la llamada, que un error nunca se convierta en `ok`, y el mensaje por código.
 */
const PERFIL = 'b0000000-0000-4000-8000-000000000001';
const CENTRO = 'c0000000-0000-4000-8000-00000000000a';

function sesionFingida(respuesta: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({
    data: respuesta.data ?? null,
    error: respuesta.error ?? null,
  });
  return { sesion: { supabase: { rpc }, usuario: { id: 'adm' } } as unknown as Sesion, rpc };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('mensajeDeErrorDeAlta', () => {
  it.each([
    ['42501', 'Solo el administrador da o retira altas de centro.'],
    ['22023', 'Las altas de centro son para profesionales sanitarios y administradores.'],
    ['23503', 'El perfil o el centro no existen.'],
    ['P0002', 'No tenía alta vigente en ese centro: puede que otra persona la haya retirado ya.'],
    ['23505', 'Otro cambio se ha cruzado con este. Vuelve a cargar la página y repite.'],
  ])('%s → su mensaje fijo, sin el de la base', (codigo, mensaje) => {
    expect(mensajeDeErrorDeAlta(codigo, 'texto interno de la base')).toBe(mensaje);
  });

  it('23514 → el mensaje de la base, que ya está en castellano llano', () => {
    expect(mensajeDeErrorDeAlta('23514', 'El centro está cerrado.')).toBe('El centro está cerrado.');
    expect(mensajeDeErrorDeAlta('23514', 'El perfil no está activo.')).toBe('El perfil no está activo.');
  });

  it('23514 sin mensaje → el genérico', () => {
    expect(mensajeDeErrorDeAlta('23514', undefined)).toBe('No se pudo guardar el cambio de centro.');
  });

  it('otro código o ninguno → el genérico, sin filtrar el texto de la base', () => {
    expect(mensajeDeErrorDeAlta('XX000', 'detalle interno')).toBe('No se pudo guardar el cambio de centro.');
    expect(mensajeDeErrorDeAlta(undefined, undefined)).toBe('No se pudo guardar el cambio de centro.');
  });
});

describe('darAltaCentro', () => {
  it('llama a dar_alta_centro con exactamente { p_perfil_id, p_centro_id } y devuelve el id', async () => {
    const { sesion, rpc } = sesionFingida({ data: 'alta-1' });

    const r = await darAltaCentro(sesion, { perfilId: PERFIL, centroId: CENTRO });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('dar_alta_centro', { p_perfil_id: PERFIL, p_centro_id: CENTRO });
    expect(r).toEqual({ ok: true, altaId: 'alta-1' });
  });

  it('un error de la base no es nunca un ok', async () => {
    const { sesion } = sesionFingida({ error: { code: '42501', message: 'x' } });

    const r = await darAltaCentro(sesion, { perfilId: PERFIL, centroId: CENTRO });

    expect(r).toEqual({
      ok: false,
      motivo: '42501',
      mensaje: 'Solo el administrador da o retira altas de centro.',
    });
  });
});

describe('retirarAltaCentro', () => {
  it('llama a retirar_alta_centro con exactamente { p_perfil_id, p_centro_id }', async () => {
    const { sesion, rpc } = sesionFingida({});

    const r = await retirarAltaCentro(sesion, { perfilId: PERFIL, centroId: CENTRO });

    expect(rpc).toHaveBeenCalledWith('retirar_alta_centro', {
      p_perfil_id: PERFIL,
      p_centro_id: CENTRO,
    });
    expect(r).toEqual({ ok: true });
  });

  it('P0002 no es un ok: otra persona se adelantó', async () => {
    const { sesion } = sesionFingida({ error: { code: 'P0002', message: 'x' } });

    const r = await retirarAltaCentro(sesion, { perfilId: PERFIL, centroId: CENTRO });

    expect(r.ok).toBe(false);
  });
});
