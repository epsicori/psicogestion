import { afterEach, describe, expect, it, vi } from 'vitest';

import { desbloquearHistoria } from './candado';
import type { Sesion } from './tipos';

const PIN = '424242';
const FILA_OK = { desbloqueado: true, motivo: 'ok', caduca_en: '2026-10-09T10:00:00Z', bloqueado_hasta: null };

/** Dos RPC (T-042): `comprobar_pin_historia` (paso uno, void) y `desbloquear_historia` (paso dos, sin argumentos). */
function sesionFingida(paso2: { data?: unknown; error?: unknown }, paso1: { error?: unknown } = {}) {
  const rpc = vi.fn().mockImplementation(async (nombre: string) =>
    nombre === 'comprobar_pin_historia'
      ? { data: null, error: paso1.error ?? null }
      : { data: paso2.data ?? null, error: paso2.error ?? null },
  );
  return { sesion: { supabase: { rpc }, usuario: { id: 'u' } } as unknown as Sesion, rpc };
}

afterEach(() => vi.restoreAllMocks());

describe('desbloquearHistoria · dos pasos', () => {
  it('llama a dos RPC por POST: el PIN solo en la primera, la segunda sin argumentos', async () => {
    const { sesion, rpc } = sesionFingida({ data: [FILA_OK] });

    const r = await desbloquearHistoria(sesion, PIN);

    expect(rpc).toHaveBeenCalledTimes(2);
    // Sin segundo argumento: ni `{ get: true }` ni nada que ponga el PIN en una URL.
    expect(rpc.mock.calls[0]).toEqual(['comprobar_pin_historia', { p_pin: PIN }]);
    expect(rpc.mock.calls[1]).toEqual(['desbloquear_historia']);
    expect(r).toEqual({ desbloqueado: true, motivo: 'ok', caducaEn: FILA_OK.caduca_en, bloqueadoHasta: null });
  });

  it('si el paso uno falla, es un error y no se llama al paso dos; el PIN no sale en consola', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion, rpc } = sesionFingida({ data: [FILA_OK] }, { error: { code: '25006', message: `pin ${PIN}` } });

    const r = await desbloquearHistoria(sesion, PIN);

    expect(r).toEqual({ desbloqueado: false, motivo: 'error', caducaEn: null, bloqueadoHasta: null });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(consola.mock.calls)).not.toContain(PIN);
  });

  it('pin_incorrecto y bloqueado se devuelven tal cual', async () => {
    const mala = sesionFingida({
      data: [{ desbloqueado: false, motivo: 'pin_incorrecto', caduca_en: null, bloqueado_hasta: null }],
    });
    expect(await desbloquearHistoria(mala.sesion, PIN)).toMatchObject({ desbloqueado: false, motivo: 'pin_incorrecto' });

    const hasta = '2026-10-09T10:15:00Z';
    const bloq = sesionFingida({
      data: [{ desbloqueado: false, motivo: 'bloqueado', caduca_en: null, bloqueado_hasta: hasta }],
    });
    expect(await desbloquearHistoria(bloq.sesion, PIN)).toMatchObject({ motivo: 'bloqueado', bloqueadoHasta: hasta });
  });

  it('si el paso dos falla o no devuelve fila, es un error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = sesionFingida({ error: { code: '57014', message: 'timeout' } });
    expect(await desbloquearHistoria(a.sesion, PIN)).toMatchObject({ desbloqueado: false, motivo: 'error' });
    const b = sesionFingida({ data: [] });
    expect(await desbloquearHistoria(b.sesion, PIN)).toMatchObject({ desbloqueado: false, motivo: 'error' });
  });

  it('un éxito no registra nada en consola', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion } = sesionFingida({ data: [FILA_OK] });
    await desbloquearHistoria(sesion, PIN);
    expect(consola).not.toHaveBeenCalled();
  });
});
