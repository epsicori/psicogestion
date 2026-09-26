import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PostgrestError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { FRAGMENTOS_DE_RECHAZO, detalleDeRechazo, mapearErrorCitas, resultadoDeError } from './errores';

/**
 * Los fragmentos de `detalleDeRechazo()` son el contrato con la migración de
 * T-011b (§3 de su diseño; §8.5 del de T-014): si alguien cambia el texto de
 * un `raise exception`, la pantalla deja de explicar el rechazo y cae al
 * genérico sin que nada falle. Esta prueba lee la migración de verdad y exige
 * que cada fragmento siga estando en un mensaje con `22023`, y que ese mensaje
 * completo, tal cual lo lanzaría Postgres, se traduzca al detalle esperado.
 */
const MIGRACION = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260925120000_editar_serie_desde_la_cita.sql'),
  'utf8',
);

const MENSAJES_22023 = [...MIGRACION.matchAll(/raise exception '((?:[^']|'')*)'[^;]*errcode = '22023'/g)].map(
  ([, mensaje]) => mensaje.replace(/''/g, "'"),
);

function error(code: string, message: string): PostgrestError {
  return { code, message, details: '', hint: '', name: 'PostgrestError' } as PostgrestError;
}

describe('detalleDeRechazo, contra la migración de T-011b', () => {
  it('encuentra mensajes 22023 en la migración, para no pasar por no mirar nada', () => {
    expect(MENSAJES_22023.length).toBeGreaterThan(10);
  });

  it.each(FRAGMENTOS_DE_RECHAZO.map(([fragmento, detalle]) => [fragmento, detalle]))(
    '«%s» está en un mensaje 22023 de la migración y da %s',
    (fragmento, detalle) => {
      const mensajes = MENSAJES_22023.filter((m) => m.includes(fragmento));
      expect(mensajes.length).toBeGreaterThan(0);
      for (const mensaje of mensajes) {
        expect(detalleDeRechazo(error('22023', mensaje))).toBe(detalle);
      }
    },
  );

  it('«Con "esta"» es un error de programación: no tiene detalle', () => {
    const mensaje = MENSAJES_22023.find((m) => m.includes('Con "esta"'));
    expect(mensaje).toBeDefined();
    expect(detalleDeRechazo(error('22023', mensaje!))).toBeNull();
  });

  it('solo mira 22023: un 42501 o un 23P01 con un texto parecido no tiene detalle', () => {
    expect(detalleDeRechazo(error('42501', 'La cita ya ha empezado o ha pasado.'))).toBeNull();
    expect(detalleDeRechazo(error('23P01', 'conflicting key value violates exclusion constraint'))).toBeNull();
  });
});

describe('resultadoDeError', () => {
  it('un 22023 conocido lleva motivo, detalle y el mensaje del motivo', () => {
    expect(resultadoDeError(error('22023', 'La serie ya tiene otra regla: esta propuesta quedó obsoleta.'))).toEqual({
      ok: false,
      motivo: 'parametro_invalido',
      detalle: 'otraRegla',
      mensaje: 'Los datos enviados no son válidos.',
    });
  });

  it('un 23P01 es hueco_ocupado y no lleva detalle', () => {
    const resultado = resultadoDeError(error('23P01', 'conflicting key value'));
    expect(resultado).toEqual({ ok: false, motivo: 'hueco_ocupado', mensaje: 'Ese hueco ya está ocupado.' });
    expect('detalle' in resultado).toBe(false);
  });

  it('«no es tuya» (42501) sigue siendo no_autorizado', () => {
    expect(mapearErrorCitas(error('42501', 'La cita no existe o no es tuya.'))).toBe('no_autorizado');
  });
});
