import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../supabase/tipos-bd';

import { primerAccesoPendiente } from './primer-acceso';

/**
 * Los criterios 2 y 3 del ticket de autenticación están declarados «Automático» y
 * quien los decide es esta función: la guardia del Proxy no hace más que redirigir
 * a `/primera-vez` cuando esto devuelve un paso. Probar aquí es probar la decisión;
 * que el Proxy redirija de verdad sigue siendo el guion manual.
 *
 * El cliente se finge entero porque la función solo usa dos cosas de él, y fingir
 * esas dos deja a la vista que no consulta ninguna otra: si mañana mirase el rol
 * por su cuenta en lugar de fiarse de `requiere_pin`, esta prueba reventaría.
 */
type Fila = Database['public']['Functions']['estado_de_cuenta']['Returns'][number];

const FILA: Fila = {
  desbloqueo_caduca_en: null as unknown as string,
  estado: 'activo',
  requiere_pin: true,
  rol: 'profesional_sanitario',
  tiene_pin: true,
};

function clienteFingido(opciones: {
  nivel: 'aal1' | 'aal2' | null;
  fila?: Partial<Fila> | null;
  error?: unknown;
}) {
  const rpc = vi.fn().mockResolvedValue({
    data: opciones.fila === null ? [] : [{ ...FILA, ...opciones.fila }],
    error: opciones.error ?? null,
  });

  const cliente = {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: vi
          .fn()
          .mockResolvedValue({ data: opciones.nivel ? { currentLevel: opciones.nivel } : null }),
      },
    },
    rpc,
  };

  return { cliente: cliente as unknown as SupabaseClient<Database>, rpc };
}

describe('primerAccesoPendiente', () => {
  it('una sesión que no ha pasado el segundo factor debe el paso TOTP, y ni pregunta a la base', async () => {
    // Criterio 2: un invitado que no ha completado TOTP no alcanza ninguna ruta con
    // sesión. Que NO llame al rpc no es un detalle de rendimiento: es lo que hace que
    // la petición cortada no pague un viaje a la base.
    const { cliente, rpc } = clienteFingido({ nivel: 'aal1' });

    expect(await primerAccesoPendiente(cliente)).toBe('totp');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sin nivel legible tampoco pasa: se debe TOTP', async () => {
    // `getAuthenticatorAssuranceLevel()` devuelve `data: null` cuando no hay sesión
    // utilizable. La comparación es `!== 'aal2'`, no `=== 'aal1'`, a propósito.
    const { cliente } = clienteFingido({ nivel: null });

    expect(await primerAccesoPendiente(cliente)).toBe('totp');
  });

  it('un profesional sanitario con el segundo factor pasado pero sin PIN debe el paso PIN', async () => {
    // Criterio 3, primera mitad (ADR-026).
    const { cliente } = clienteFingido({ nivel: 'aal2', fila: { tiene_pin: false } });

    expect(await primerAccesoPendiente(cliente)).toBe('pin');
  });

  it('GEMELA · el técnico administrativo NO debe el paso PIN aunque no tenga PIN', async () => {
    // Criterio 3, segunda mitad: la decisión viene de `requiere_pin`, que la fija la
    // base, y no de un condicional sobre el rol en la pantalla. Por eso la fila lleva
    // `tiene_pin: false` igual que la anterior y aun así el resultado es null.
    const { cliente } = clienteFingido({
      nivel: 'aal2',
      fila: { requiere_pin: false, tiene_pin: false, rol: 'tecnico_administrativo' },
    });

    expect(await primerAccesoPendiente(cliente)).toBeNull();
  });

  it('con el segundo factor pasado y el PIN fijado no debe ningún paso', async () => {
    const { cliente } = clienteFingido({ nivel: 'aal2' });

    expect(await primerAccesoPendiente(cliente)).toBeNull();
  });

  it('si la lectura del estado falla NO inventa un paso pendiente', async () => {
    // Deliberado y documentado en la función: cortar el paso a toda la aplicación por
    // un fallo de lectura sería peor que dejar pasar, porque cada Server Action
    // revalida por su cuenta y RLS sigue en pie detrás.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cliente } = clienteFingido({ nivel: 'aal2', error: { message: 'caida' } });

    expect(await primerAccesoPendiente(cliente)).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('sin fila de estado tampoco inventa un paso', async () => {
    const { cliente } = clienteFingido({ nivel: 'aal2', fila: null });

    expect(await primerAccesoPendiente(cliente)).toBeNull();
  });
});
