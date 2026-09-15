import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El criterio 2 del ticket de autenticación —quien no ha completado el primer acceso no
 * alcanza NINGUNA ruta con sesión— se decide en `primerAccesoPendiente()`, que tiene sus
 * propias pruebas, pero se ejecuta aquí. Esto prueba la otra mitad: que la decisión se
 * convierte en una redirección de verdad, y que las dos exenciones existen.
 *
 * `config.ts` se finge porque lee variables de entorno al importarse y reventaría el
 * fichero entero antes de la primera prueba; no se prueba nada suyo aquí.
 */
vi.mock('@/lib/supabase/config', () => ({
  urlSupabase: 'http://127.0.0.1:54321',
  claveAnonSupabase: 'anon-de-prueba',
}));

const getUser = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: (...a: unknown[]) => getUser(...a) } }),
}));

const primerAccesoPendiente = vi.fn();
vi.mock('@/lib/cuentas/primer-acceso', () => ({
  primerAccesoPendiente: (...a: unknown[]) => primerAccesoPendiente(...a),
}));

const { proxy } = await import('./proxy');

const USUARIO = { id: 'b0030001-0000-4000-8000-000000000002' };

const peticion = (ruta: string) => new NextRequest(new URL(`http://localhost:3000${ruta}`));
const destino = (r: Response) => r.headers.get('location');

describe('proxy · guardia de sesión', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: null } });
    primerAccesoPendiente.mockReset().mockResolvedValue(null);
  });

  it('sin sesión, una ruta protegida manda a /login', async () => {
    expect(destino(await proxy(peticion('/pacientes')))).toBe('http://localhost:3000/login');
  });

  it('sin sesión, /login y /prototipo se dejan pasar', async () => {
    expect(destino(await proxy(peticion('/login')))).toBeNull();
    expect(destino(await proxy(peticion('/prototipo')))).toBeNull();
  });

  it('sin sesión no se pregunta por el primer acceso: no hay a quién preguntárselo', async () => {
    await proxy(peticion('/pacientes'));
    expect(primerAccesoPendiente).not.toHaveBeenCalled();
  });
});

describe('proxy · guardia del primer acceso', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: USUARIO } });
    primerAccesoPendiente.mockReset();
  });

  it('con un paso pendiente, NINGUNA ruta del espacio de trabajo se alcanza', async () => {
    // Criterio 2. Se prueban varias rutas y no una, porque lo que el criterio exige no es
    // que /pacientes corte, sino que no quede ninguna puerta lateral abierta.
    primerAccesoPendiente.mockResolvedValue('totp');

    for (const ruta of ['/pacientes', '/candado', '/ajustes', '/ajustes/invitar', '/']) {
      expect(destino(await proxy(peticion(ruta)))).toBe('http://localhost:3000/primera-vez');
    }
  });

  it('el paso PIN corta igual que el paso TOTP', async () => {
    primerAccesoPendiente.mockResolvedValue('pin');
    expect(destino(await proxy(peticion('/pacientes')))).toBe('http://localhost:3000/primera-vez');
  });

  it('/primera-vez está exenta, o se redirigiría a sí misma en bucle', async () => {
    primerAccesoPendiente.mockResolvedValue('totp');
    expect(destino(await proxy(peticion('/primera-vez')))).toBeNull();
  });

  it('/recuperar está exenta, o la pantalla existiría y nadie podría llegar a ella', async () => {
    // Quien ha perdido el segundo factor entra con contraseña y se queda en aal1, así que
    // `primerAccesoPendiente()` dice 'totp' para él. Sin la exención, la guardia lo manda a
    // /primera-vez, donde su factor sigue existiendo y no tiene cómo superarlo.
    primerAccesoPendiente.mockResolvedValue('totp');
    expect(destino(await proxy(peticion('/recuperar')))).toBeNull();
  });

  it('completado el primer acceso, se pasa', async () => {
    primerAccesoPendiente.mockResolvedValue(null);
    expect(destino(await proxy(peticion('/pacientes')))).toBeNull();
  });
});
