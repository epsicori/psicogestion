import { beforeEach, describe, expect, it, vi } from 'vitest';

// T-026a · Las tres acciones de Ajustes › Programa de facturación. La clave es un secreto: ningún
// valor devuelto la lleva, ni en el éxito ni en el fallo.

const CENTINELA = 'SENTINELA_ACCION_abcdefghij';

const rpc = vi.fn();
const sesion = { supabase: { rpc: (...a: unknown[]) => rpc(...a) }, usuario: { id: 'u1' } };
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: async () => sesion }));

const estadoDeCuenta = vi.fn();
vi.mock('@/lib/cuentas/candado', () => ({ estadoDeCuenta: (...a: unknown[]) => estadoDeCuenta(...a) }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const rpcAdmin = vi.fn();
vi.mock('@/lib/supabase/administracion', () => ({
  crearClienteAdministracion: () => ({ rpc: (...a: unknown[]) => rpcAdmin(...a) }),
}));

const proveedorActivo = vi.fn();
vi.mock('@/lib/facturacion/registro', () => ({ proveedorActivo: () => proveedorActivo() }));

const { guardarClaveProveedor, probarConexion, desconectarProveedor } = await import('./acciones');
const { ErrorProveedor } = await import('@/lib/facturacion/proveedor');

beforeEach(() => {
  vi.clearAllMocks();
  estadoDeCuenta.mockResolvedValue({ rol: 'administrador' });
  rpc.mockResolvedValue({ error: null });
});

describe('guardarClaveProveedor', () => {
  it('guarda con el administrador y no devuelve la clave', async () => {
    const resultado = await guardarClaveProveedor({ proveedor: 'holded', clave: CENTINELA });
    expect(resultado).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('guardar_clave_proveedor_facturacion', {
      p_proveedor: 'holded',
      p_clave: CENTINELA,
    });
    expect(JSON.stringify(resultado)).not.toContain(CENTINELA);
  });

  it.each(['profesional_sanitario', 'tecnico_administrativo'])('%s: sin_permiso y no llama a la base', async (rol) => {
    estadoDeCuenta.mockResolvedValue({ rol });
    expect(await guardarClaveProveedor({ proveedor: 'holded', clave: CENTINELA })).toEqual({
      ok: false,
      error: 'sin_permiso',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('una clave con espacios o corta es clave_invalida y no llega a la base', async () => {
    for (const clave of ['corta', 'con espacios dentro de la clave 1234']) {
      const resultado = await guardarClaveProveedor({ proveedor: 'holded', clave });
      expect(resultado).toEqual({ ok: false, error: 'clave_invalida' });
      expect(JSON.stringify(resultado)).not.toContain(clave);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('elige el error por el código SQL y nunca devuelve el mensaje de la base', async () => {
    rpc.mockResolvedValueOnce({ error: { code: '42501', message: `x ${CENTINELA}` } });
    expect(await guardarClaveProveedor({ proveedor: 'holded', clave: CENTINELA })).toEqual({
      ok: false,
      error: 'sin_permiso',
    });
    rpc.mockResolvedValueOnce({ error: { code: '22023', message: `x ${CENTINELA}` } });
    expect(await guardarClaveProveedor({ proveedor: 'holded', clave: CENTINELA })).toEqual({
      ok: false,
      error: 'clave_invalida',
    });
    rpc.mockResolvedValueOnce({ error: { code: 'XX000', message: `x ${CENTINELA}` } });
    const fallo = await guardarClaveProveedor({ proveedor: 'holded', clave: CENTINELA });
    expect(fallo).toEqual({ ok: false, error: 'fallo' });
    expect(JSON.stringify(fallo)).not.toContain(CENTINELA);
  });
});

describe('probarConexion', () => {
  it('sin programa disponible dice sin_programa', async () => {
    proveedorActivo.mockResolvedValue(null);
    expect(await probarConexion()).toEqual({ ok: false, error: 'sin_programa' });
  });

  it('con programa y clave, lista documentos y devuelve ok sin la clave', async () => {
    const listarDocumentosDesde = vi.fn().mockResolvedValue([]);
    const crear = vi.fn().mockReturnValue({ listarDocumentosDesde });
    proveedorActivo.mockResolvedValue({ crear });
    rpcAdmin.mockResolvedValue({ data: CENTINELA, error: null });

    const resultado = await probarConexion();
    expect(resultado).toEqual({ ok: true });
    expect(crear).toHaveBeenCalledWith(CENTINELA);
    expect(listarDocumentosDesde).toHaveBeenCalledOnce();
    expect(JSON.stringify(resultado)).not.toContain(CENTINELA);
  });

  it('un error del programa sale como su código', async () => {
    proveedorActivo.mockResolvedValue({
      crear: () => ({ listarDocumentosDesde: vi.fn().mockRejectedValue(new ErrorProveedor('no_autorizado')) }),
    });
    rpcAdmin.mockResolvedValue({ data: CENTINELA, error: null });
    expect(await probarConexion()).toEqual({ ok: false, error: 'no_autorizado' });
  });

  it('quien no es administrador no prueba nada', async () => {
    estadoDeCuenta.mockResolvedValue({ rol: 'profesional_sanitario' });
    expect(await probarConexion()).toEqual({ ok: false, error: 'sin_permiso' });
    expect(rpcAdmin).not.toHaveBeenCalled();
  });
});

describe('desconectarProveedor', () => {
  it('desconecta con el administrador', async () => {
    expect(await desconectarProveedor()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('quitar_proveedor_facturacion');
  });

  it('el técnico recibe sin_permiso sin llamar a la base', async () => {
    estadoDeCuenta.mockResolvedValue({ rol: 'tecnico_administrativo' });
    expect(await desconectarProveedor()).toEqual({ ok: false, error: 'sin_permiso' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('un fallo de la base es fallo', async () => {
    rpc.mockResolvedValueOnce({ error: { code: 'XX000' } });
    expect(await desconectarProveedor()).toEqual({ ok: false, error: 'fallo' });
  });
});
