import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => {} }));

const proveedorActivoServicio = vi.fn();
vi.mock('@/lib/facturacion/registro', () => ({
  proveedorActivoServicio: () => proveedorActivoServicio(),
}));
vi.mock('@/lib/supabase/administracion', () => ({ crearClienteAdministracion: () => ({}) }));
vi.mock('@/lib/facturacion/clave', () => ({ leerClaveProveedor: async () => 'clave-de-prueba-123456' }));
const drenarEnvios = vi.fn((...args: unknown[]) => Promise.resolve({ enviados: args.length * 0, reintentos: 0, fallidos: 0 }));
vi.mock('@/lib/facturacion/cola', () => ({ drenarEnvios: (d: unknown) => drenarEnvios(d) }));
const sincronizar = vi.fn((...args: unknown[]) => Promise.resolve({ copiados: args.length * 0, anotados: 0, discrepancias: 0 }));
vi.mock('@/lib/facturacion/sincronizador', () => ({ sincronizar: (d: unknown) => sincronizar(d) }));
vi.mock('@/lib/facturacion/nif', () => ({ descifrarNifDestinatario: async () => null }));

import { POST } from './route';

const SECRETO = 'secreto-de-prueba-largo-123';

function pedir(cabecera?: string) {
  return new Request('http://localhost/api/facturacion/drenar', {
    method: 'POST',
    headers: cabecera === undefined ? {} : { authorization: cabecera },
  });
}

describe('POST /api/facturacion/drenar', () => {
  beforeEach(() => {
    proveedorActivoServicio.mockReset();
    drenarEnvios.mockClear();
    sincronizar.mockClear();
    vi.stubEnv('FACTURACION_DRENAR_SECRETO', SECRETO);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('503 sin la variable de entorno, aunque llegue una cabecera', async () => {
    vi.stubEnv('FACTURACION_DRENAR_SECRETO', '');
    const r = await POST(pedir('Bearer '));
    expect(r.status).toBe(503);
    expect(proveedorActivoServicio).not.toHaveBeenCalled();
  });

  it('401 sin cabecera', async () => {
    expect((await POST(pedir())).status).toBe(401);
  });

  it('401 con un secreto de la misma longitud', async () => {
    const igual = 'x'.repeat(SECRETO.length);
    expect((await POST(pedir(`Bearer ${igual}`))).status).toBe(401);
  });

  it('401 con un secreto de otra longitud', async () => {
    expect((await POST(pedir('Bearer corto'))).status).toBe(401);
    expect(proveedorActivoServicio).not.toHaveBeenCalled();
  });

  it('con el secreto y sin programa conectado responde sin_proveedor y no drena', async () => {
    proveedorActivoServicio.mockResolvedValue(null);
    const r = await POST(pedir(`Bearer ${SECRETO}`));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ estado: 'sin_proveedor' });
    expect(drenarEnvios).not.toHaveBeenCalled();
    expect(r.headers.get('cache-control')).toBe('private, no-store');
  });

  it('con el secreto y programa disponible drena y sincroniza', async () => {
    proveedorActivoServicio.mockResolvedValue({
      ficha: { id: 'holded' },
      crear: () => ({}),
    });
    const r = await POST(pedir(`Bearer ${SECRETO}`));
    expect(r.status).toBe(200);
    expect(drenarEnvios).toHaveBeenCalledTimes(1);
    expect(sincronizar).toHaveBeenCalledTimes(1);
  });
});
