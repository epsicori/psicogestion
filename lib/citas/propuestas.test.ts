import { describe, expect, it } from 'vitest';

import { listarPropuestasPendientes } from './propuestas';
import type { Sesion } from './tipos';

/**
 * Hallazgo 5 de la revisión con Opus (11-09-2026): `listarPropuestasPendientes()`
 * devolvía `[]` ante un error de lectura, así que una pantalla de propuestas
 * pendientes enseñaba «no hay nada que decidir» cuando lo que había era un fallo
 * — y lo pendiente son sesiones de pacientes sin colocar.
 *
 * El cliente de Supabase se sustituye por un doble mínimo: la cadena
 * `.from().select().eq().order()` devuelve lo que le diga cada prueba. No hay
 * base de datos aquí; lo que se prueba es el contrato del módulo, no la consulta.
 */
function sesionFalsa(respuesta: { data: unknown; error: unknown }): Sesion {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    order: () => Promise.resolve(respuesta),
  };
  return {
    supabase: { from: () => consulta } as unknown as Sesion['supabase'],
    usuario: { id: 'pro1' } as unknown as Sesion['usuario'],
  };
}

const FILA = {
  id: 'p1',
  serie_id: 's1',
  cita_id: null,
  paciente_id: 'pac1',
  profesional_id: 'pro1',
  centro_id: 'c1',
  motivo: 'festivo',
  fecha_prevista: '2026-05-01',
  hora_local_prevista: '09:00:00',
  inicio_propuesto: null,
  fin_propuesto: null,
  zona_horaria: 'Europe/Madrid',
};

describe('listarPropuestasPendientes', () => {
  it('devuelve las propuestas con las claves en castellano cuando la lectura va bien', async () => {
    const resultado = await listarPropuestasPendientes(
      sesionFalsa({ data: [FILA], error: null }),
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.propuestas).toHaveLength(1);
    expect(resultado.propuestas[0].serieId).toBe('s1');
    expect(resultado.propuestas[0].fechaPrevista).toBe('2026-05-01');
  });

  it('una lista vacía de verdad se distingue de un fallo: ok con cero propuestas', async () => {
    const resultado = await listarPropuestasPendientes(sesionFalsa({ data: [], error: null }));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.propuestas).toEqual([]);
  });

  it('un fallo de lectura NO se disfraza de lista vacía', async () => {
    const resultado = await listarPropuestasPendientes(
      sesionFalsa({
        data: null,
        error: { code: '42501', message: 'permission denied for table propuestas_cita' },
      }),
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.motivo).toBe('no_autorizado');
    expect(resultado.mensaje).toBe('No tienes autorización para esta operación.');
  });
});
