import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { drenarEnvios, type FilaReclamada } from './cola';
import { crearProveedorSimulado } from './simulado';

function fila(extra: Partial<FilaReclamada> = {}): FilaReclamada {
  return {
    evento_id: 'e1',
    borrador_id: 'b1',
    version_id: 'v1',
    numero_version: 1,
    destinatario_nombre: 'Ana Uno',
    destinatario_nif_cifrado: null,
    destinatario_nif_nonce: null,
    destinatario_nif_etiqueta: null,
    destinatario_nif_clave_version: null,
    lineas: [
      { cantidad: 1, precio_unitario_centimos: 6000, regimen_iva: 'exento_sanitario', tipo_iva_centesimas: 0 },
    ] as FilaReclamada['lineas'],
    fecha_documento: '2026-10-14',
    ya_enviado_documento_id: null,
    ...extra,
  } as FilaReclamada;
}

type Llamada = { nombre: string; args: Record<string, unknown> };

function bdFalsa(filas: FilaReclamada[], fallosDeRegistro = 0) {
  const llamadas: Llamada[] = [];
  let pendientesFallos = fallosDeRegistro;
  const bd = {
    rpc: async (nombre: string, args: Record<string, unknown> = {}) => {
      llamadas.push({ nombre, args });
      if (nombre === 'reclamar_envios_facturacion') return { data: filas, error: null };
      if (nombre === 'registrar_envio_borrador' && pendientesFallos > 0) {
        pendientesFallos -= 1;
        return { data: null, error: { message: 'x' } };
      }
      return { data: null, error: null };
    },
  };
  return { bd: bd as never, llamadas };
}

const ctx = (bd: never, proveedor: ReturnType<typeof crearProveedorSimulado>['proveedor']) => ({
  bd,
  proveedor,
  idProveedor: 'holded' as const,
  descifrarNif: async () => null,
});

describe('drenarEnvios', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('crea el borrador y registra el envío', async () => {
    const { proveedor, control } = crearProveedorSimulado();
    const { bd, llamadas } = bdFalsa([fila()]);
    const r = await drenarEnvios(ctx(bd, proveedor));
    expect(r).toEqual({ enviados: 1, reintentos: 0, fallidos: 0 });
    expect(control.documentos()).toHaveLength(1);
    expect(llamadas.find((l) => l.nombre === 'registrar_envio_borrador')?.args).toMatchObject({
      p_evento_id: 'e1',
      p_documento_id: 'SIM-1',
      p_version_id: 'v1',
      p_proyeccion_version: 1,
    });
  });

  it('si el documento ya existe, no crea otro', async () => {
    const { proveedor, control } = crearProveedorSimulado();
    const { bd, llamadas } = bdFalsa([fila({ ya_enviado_documento_id: 'DOC-9' })]);
    const r = await drenarEnvios(ctx(bd, proveedor));
    expect(r.enviados).toBe(1);
    expect(control.documentos()).toHaveLength(0);
    expect(llamadas.find((l) => l.nombre === 'registrar_envio_borrador')?.args.p_documento_id).toBe('DOC-9');
  });

  it('un proveedor caído es un fallo reintentable', async () => {
    const { proveedor, control } = crearProveedorSimulado();
    control.caido(true);
    const { bd, llamadas } = bdFalsa([fila()]);
    const r = await drenarEnvios(ctx(bd, proveedor));
    expect(r.reintentos).toBe(1);
    expect(llamadas.find((l) => l.nombre === 'registrar_fallo_envio_facturacion')?.args).toMatchObject({
      p_codigo: 'red',
      p_permanente: false,
    });
  });

  it('una respuesta perdida es un fallo ambiguo y permanente', async () => {
    const { proveedor, control } = crearProveedorSimulado();
    control.perderRespuesta();
    const { bd, llamadas } = bdFalsa([fila()]);
    const r = await drenarEnvios(ctx(bd, proveedor));
    expect(r.fallidos).toBe(1);
    expect(llamadas.find((l) => l.nombre === 'registrar_fallo_envio_facturacion')?.args).toMatchObject({
      p_codigo: 'ambiguo',
      p_permanente: true,
    });
  });

  it('si no consigue anotar el envío tras tres intentos, lo deja como ambiguo permanente', async () => {
    const { proveedor } = crearProveedorSimulado();
    const { bd, llamadas } = bdFalsa([fila()], 3);
    const r = await drenarEnvios(ctx(bd, proveedor));
    expect(llamadas.filter((l) => l.nombre === 'registrar_envio_borrador')).toHaveLength(3);
    expect(r.fallidos).toBe(1);
    expect(llamadas.find((l) => l.nombre === 'registrar_fallo_envio_facturacion')?.args).toMatchObject({
      p_codigo: 'ambiguo',
      p_permanente: true,
    });
  });

  it('un error cualquiera es rechazado y permanente, y solo se registra el código', async () => {
    const { proveedor } = crearProveedorSimulado();
    const { bd, llamadas } = bdFalsa([fila({ destinatario_nif_clave_version: 7 })]);
    const r = await drenarEnvios({
      ...ctx(bd, proveedor),
      descifrarNif: async () => {
        throw new Error('NIF 12345678Z con la clave secreta');
      },
    });
    expect(r.fallidos).toBe(1);
    expect(llamadas.find((l) => l.nombre === 'registrar_fallo_envio_facturacion')?.args).toMatchObject({
      p_codigo: 'rechazado',
      p_permanente: true,
    });
    const registrado = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(registrado).toBe(JSON.stringify([['[facturacion] envio', 'rechazado']]));
  });
});
