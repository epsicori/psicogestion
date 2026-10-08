import { describe, expect, it, vi } from 'vitest';

import { sincronizar } from './sincronizador';
import { crearProveedorSimulado } from './simulado';
import type { HechosDeExpedicion } from './proveedor';

type Llamada = { nombre: string; args: Record<string, unknown> };

interface InfoDoc {
  proveedor_documento_id: string;
  tiene_espejo: boolean;
  anotaciones: string[];
}

// Una base de datos de mentira que solo apunta las RPC. `espejoDistinto` simula el 23505 de
// registrar_factura_espejo cuando los datos ya copiados no coinciden.
function bdFalsa(opciones: {
  pendientes?: InfoDoc[];
  conEnvio?: InfoDoc[];
  cursor?: string | null;
  espejoDistinto?: Set<string>;
}) {
  const llamadas: Llamada[] = [];
  const bd = {
    rpc: vi.fn(async (nombre: string, args: Record<string, unknown> = {}) => {
      llamadas.push({ nombre, args });
      if (nombre === 'documentos_para_sincronizar') {
        const ids = args.p_ids as string[] | undefined;
        if (ids) {
          return {
            data: (opciones.conEnvio ?? []).filter((d) => ids.includes(d.proveedor_documento_id)),
            error: null,
          };
        }
        return { data: opciones.pendientes ?? [], error: null };
      }
      if (nombre === 'avanzar_cursor_sincronizacion') {
        return { data: opciones.cursor ?? null, error: null };
      }
      if (
        nombre === 'registrar_factura_espejo' &&
        opciones.espejoDistinto?.has(args.p_proveedor_documento_id as string)
      ) {
        return { data: null, error: { code: '23505', message: 'x' } };
      }
      return { data: 'id', error: null };
    }),
  };
  return { bd, llamadas };
}

const HECHOS: HechosDeExpedicion = {
  numero: 'F-1',
  fechaExpedicion: '2026-10-14',
  baseCentimos: 6000,
  cuotaIvaCentimos: 0,
  totalCentimos: 6000,
  enlace: 'https://simulado.example/doc/1',
};

const AHORA = new Date('2026-10-14T12:00:00Z');

async function conDocumento() {
  const { proveedor, control } = crearProveedorSimulado();
  const { documentoId } = await proveedor.crearBorrador({
    destinatario: { nombre: 'Ana', nif: null },
    fecha: '2026-10-14',
    lineas: [],
  });
  return { proveedor, control, id: documentoId };
}

const nombres = (l: Llamada[]) => l.map((x) => x.nombre);

describe('sincronizar', () => {
  it('un documento aprobado copia el espejo', async () => {
    const { proveedor, control, id } = await conDocumento();
    control.aprobar(id, HECHOS);
    const { bd, llamadas } = bdFalsa({
      pendientes: [{ proveedor_documento_id: id, tiene_espejo: false, anotaciones: [] }],
    });

    const r = await sincronizar({ bd: bd as never, proveedor, idProveedor: 'holded', ahora: AHORA });

    expect(r.copiados).toBe(1);
    const espejo = llamadas.find((l) => l.nombre === 'registrar_factura_espejo');
    expect(espejo?.args).toMatchObject({
      p_proveedor: 'holded',
      p_proveedor_documento_id: id,
      p_numero: 'F-1',
      p_fecha_expedicion: '2026-10-14',
      p_base_centimos: 6000,
      p_cuota_iva_centimos: 0,
      p_total_centimos: 6000,
      p_url_proveedor: 'https://simulado.example/doc/1',
    });
  });

  it('un borrador sin aprobar no escribe nada', async () => {
    const { proveedor, id } = await conDocumento();
    const { bd, llamadas } = bdFalsa({
      pendientes: [{ proveedor_documento_id: id, tiene_espejo: false, anotaciones: [] }],
    });
    const r = await sincronizar({ bd: bd as never, proveedor, idProveedor: 'holded', ahora: AHORA });
    expect(r).toEqual({ copiados: 0, anotados: 0, discrepancias: 0 });
    expect(nombres(llamadas)).not.toContain('registrar_factura_espejo');
    expect(nombres(llamadas)).not.toContain('registrar_anotacion_documento');
  });

  it('un documento borrado sin aprobar se anota', async () => {
    const { proveedor, control, id } = await conDocumento();
    control.borrar(id);
    const { bd, llamadas } = bdFalsa({
      pendientes: [{ proveedor_documento_id: id, tiene_espejo: false, anotaciones: [] }],
    });
    const r = await sincronizar({ bd: bd as never, proveedor, idProveedor: 'holded', ahora: AHORA });
    expect(r.anotados).toBe(1);
    expect(llamadas.find((l) => l.nombre === 'registrar_anotacion_documento')?.args).toMatchObject({
      p_proveedor_documento_id: id,
      p_tipo: 'borrado_sin_aprobar',
    });
  });

  it('rectificado sin espejo copia primero el espejo y luego anota', async () => {
    const { proveedor, control, id } = await conDocumento();
    control.aprobar(id, HECHOS);
    control.rectificar(id);
    const { bd, llamadas } = bdFalsa({
      pendientes: [{ proveedor_documento_id: id, tiene_espejo: false, anotaciones: [] }],
    });
    const r = await sincronizar({ bd: bd as never, proveedor, idProveedor: 'holded', ahora: AHORA });
    expect(r).toMatchObject({ copiados: 1, anotados: 1 });
    const orden = nombres(llamadas).filter((n) => n.startsWith('registrar_'));
    expect(orden).toEqual(['registrar_factura_espejo', 'registrar_anotacion_documento']);
  });

  it('pasada B: un cambio posterior en un documento con envío se anota; el ajeno se ignora', async () => {
    const { proveedor, control, id } = await conDocumento();
    control.aprobar(id, HECHOS);
    control.anular(id);
    const ajeno = await proveedor.crearBorrador({
      destinatario: { nombre: 'Otro', nif: null },
      fecha: '2026-10-14',
      lineas: [],
    });
    control.aprobar(ajeno.documentoId, { ...HECHOS, numero: 'F-9' });
    const { bd, llamadas } = bdFalsa({
      conEnvio: [{ proveedor_documento_id: id, tiene_espejo: true, anotaciones: [] }],
      cursor: '2026-10-14T11:00:00Z',
    });

    const r = await sincronizar({ bd: bd as never, proveedor, idProveedor: 'holded', ahora: AHORA });

    expect(r.anotados).toBe(1);
    const anotaciones = llamadas.filter((l) => l.nombre === 'registrar_anotacion_documento');
    expect(anotaciones).toHaveLength(1);
    expect(anotaciones[0].args).toMatchObject({ p_proveedor_documento_id: id, p_tipo: 'anulado' });
    const espejos = llamadas.filter((l) => l.nombre === 'registrar_factura_espejo');
    expect(espejos.map((e) => e.args.p_proveedor_documento_id)).toEqual([id]);
  });

  it('un 23505 del espejo avisa de la discrepancia y no reintenta con otros datos', async () => {
    const { proveedor, control, id } = await conDocumento();
    control.aprobar(id, HECHOS);
    control.cambiarHechos(id, { ...HECHOS, totalCentimos: 7000, baseCentimos: 7000 });
    const { bd, llamadas } = bdFalsa({
      conEnvio: [{ proveedor_documento_id: id, tiene_espejo: true, anotaciones: [] }],
      espejoDistinto: new Set([id]),
    });
    const r = await sincronizar({ bd: bd as never, proveedor, idProveedor: 'holded', ahora: AHORA });
    expect(r.discrepancias).toBe(1);
    expect(r.copiados).toBe(0);
    expect(llamadas.filter((l) => l.nombre === 'registrar_factura_espejo')).toHaveLength(1);
    expect(llamadas.find((l) => l.nombre === 'notificar_discrepancia_facturacion')?.args).toMatchObject({
      p_proveedor_documento_id: id,
    });
  });

  it('avanza el cursor a diez minutos antes del inicio', async () => {
    const { proveedor } = crearProveedorSimulado();
    const { bd, llamadas } = bdFalsa({});
    await sincronizar({ bd: bd as never, proveedor, idProveedor: 'holded', ahora: AHORA });
    const avance = llamadas.filter(
      (l) => l.nombre === 'avanzar_cursor_sincronizacion' && l.args.p_hasta,
    );
    expect(avance).toHaveLength(1);
    expect(avance[0].args.p_hasta).toBe('2026-10-14T11:50:00.000Z');
  });

  it('solo lee del proveedor: nunca crea un borrador', async () => {
    const { proveedor, control } = crearProveedorSimulado();
    const crear = vi.spyOn(proveedor, 'crearBorrador');
    const { bd } = bdFalsa({});
    await sincronizar({ bd: bd as never, proveedor, idProveedor: 'holded', ahora: AHORA });
    expect(crear).not.toHaveBeenCalled();
    expect(control.documentos()).toHaveLength(0);
  });
});
