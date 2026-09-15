import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../supabase/tipos-bd';

import { registrarAccesoHistoria } from './accesos';
import type { Sesion } from './tipos';

/**
 * Lo que decide «una apertura, N vistas» es la base —el índice parcial
 * `accesos_historia_ventana_idx` y la función que lo usa—, y eso se prueba en
 * `scripts/rls/09-accesos.sql` contra Postgres de verdad. Aquí se prueba lo único que
 * decide este fichero: que la llamada lleva los argumentos que lleva, y sobre todo que
 * **un rechazo no se convierte nunca en un `ok`**. Si esto se rompiera, una pantalla
 * enseñaría una historia cuya lectura no quedó registrada.
 */
const PACIENTE = 'd0030001-0000-4000-8000-000000000001';

function sesionFingida(respuesta: { data?: unknown; error?: { code?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({
    data: respuesta.data ?? null,
    error: respuesta.error ?? null,
  });
  const sesion = { supabase: { rpc }, usuario: { id: 'u' } };
  return { sesion: sesion as unknown as Sesion, rpc };
}

const APERTURA = [{ acceso_id: 7, vistas: 1, apertura: true }];

describe('registrarAccesoHistoria', () => {
  it('llama a registrar_acceso_historia con el paciente y la pestaña, y devuelve la apertura', async () => {
    const { sesion, rpc } = sesionFingida({ data: APERTURA });

    const resultado = await registrarAccesoHistoria(sesion, PACIENTE, 'notas_clinicas');

    expect(rpc).toHaveBeenCalledWith('registrar_acceso_historia', {
      p_paciente_id: PACIENTE,
      p_pestana: 'notas_clinicas',
      p_agente: undefined,
      p_ip: undefined,
    });
    expect(resultado).toEqual({ ok: true, accesoId: 7, vistas: 1, apertura: true });
  });

  it('el id del desbloqueo no entra ni sale: la llamada no lo menciona', async () => {
    // No es una prueba de estilo. `select` sobre `desbloqueos_historia` está revocado a
    // `authenticated`, así que si esta función algún día aceptara un id, sería porque
    // alguien lo devolvió al cliente — y eso es el candado abierto por detrás.
    const { sesion, rpc } = sesionFingida({ data: APERTURA });

    await registrarAccesoHistoria(sesion, PACIENTE, 'notas_clinicas');

    const argumentos = JSON.stringify(rpc.mock.calls[0]);
    expect(argumentos).not.toContain('desbloqueo');
  });

  it('una repetición dentro de la ventana vuelve con apertura falsa y el contador subido', async () => {
    const { sesion } = sesionFingida({ data: [{ acceso_id: 7, vistas: 2, apertura: false }] });

    expect(await registrarAccesoHistoria(sesion, PACIENTE, 'notas_clinicas')).toEqual({
      ok: true,
      accesoId: 7,
      vistas: 2,
      apertura: false,
    });
  });

  it('pasa la huella de la petición cuando se le da', async () => {
    const { sesion, rpc } = sesionFingida({ data: APERTURA });

    await registrarAccesoHistoria(sesion, PACIENTE, 'evaluaciones', {
      ip: '10.0.0.4',
      agente: 'Firefox',
    });

    expect(rpc).toHaveBeenCalledWith('registrar_acceso_historia', {
      p_paciente_id: PACIENTE,
      p_pestana: 'evaluaciones',
      p_agente: 'Firefox',
      p_ip: '10.0.0.4',
    });
  });

  it('GEMELA · un 42501 es «denegado», nunca un ok', async () => {
    // 42501 lo levantan las dos guardias de la función: sin desbloqueo vigente, o el
    // paciente no es de quien llama. Las dos tienen que acabar aquí.
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion } = sesionFingida({ error: { code: '42501' } });

    const resultado = await registrarAccesoHistoria(sesion, PACIENTE, 'notas_clinicas');

    expect(resultado.ok).toBe(false);
    expect(resultado).toMatchObject({ motivo: 'denegado' });
    consola.mockRestore();
  });

  it('el mensaje de un rechazo no dice si el paciente existe', async () => {
    // Un «no tienes acceso a ESE paciente» distinto de un «no existe» convierte la
    // pantalla en un buscador de pacientes ajenos.
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion } = sesionFingida({ error: { code: '42501' } });

    const resultado = await registrarAccesoHistoria(sesion, PACIENTE, 'notas_clinicas');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.mensaje).not.toContain(PACIENTE);
    consola.mockRestore();
  });

  it('cualquier otro error tampoco pasa por ok', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion } = sesionFingida({ error: { code: '08006' } });

    expect(await registrarAccesoHistoria(sesion, PACIENTE, 'notas_clinicas')).toMatchObject({
      ok: false,
      motivo: 'error',
    });
    consola.mockRestore();
  });

  it('una respuesta sin fila no se toma por buena', async () => {
    // La función de la base devuelve fila o levanta. Sin fila, algo cambió debajo: lo
    // seguro es no abrir, no suponer que se registró.
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sesion } = sesionFingida({ data: [] });

    expect(await registrarAccesoHistoria(sesion, PACIENTE, 'notas_clinicas')).toMatchObject({
      ok: false,
      motivo: 'error',
    });
    consola.mockRestore();
  });
});
