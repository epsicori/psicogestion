// T-026a. El sincronizador: copia al espejo lo que el programa de facturación ya expidió y anota lo que
// pasó después (borrado sin aprobar, rectificado, anulado). SOLO LEE del proveedor (ADR-078 1: «ni una
// acción encadenada a una sincronización»). Nunca actualiza el espejo: una diferencia se avisa.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/tipos-bd';

import type { DocumentoObservado, IdProveedor, ProveedorFacturacion } from './proveedor';

export interface DependenciasSincronizacion {
  bd: SupabaseClient<Database>;
  proveedor: ProveedorFacturacion;
  idProveedor: IdProveedor;
  ahora: Date;
}

export interface ResultadoSincronizacion {
  copiados: number;
  anotados: number;
  discrepancias: number;
}

type Anotacion = Database['public']['Enums']['anotacion_documento_proveedor'];

interface InfoDocumento {
  tieneEspejo: boolean;
  anotaciones: readonly string[];
}

const LIMITE_PASADA_A = 50;
const MARGEN_DEL_CURSOR_MS = 10 * 60 * 1000;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

function fallo(e: { message?: string } | null, que: string): never {
  // Nunca el mensaje de la base: solo qué se estaba haciendo.
  void e;
  throw new Error(`Fallo al sincronizar (${que}).`);
}

export async function sincronizar(dep: DependenciasSincronizacion): Promise<ResultadoSincronizacion> {
  const resultado: ResultadoSincronizacion = { copiados: 0, anotados: 0, discrepancias: 0 };
  const { bd, proveedor, idProveedor } = dep;

  async function anotar(documentoId: string, tipo: Anotacion, info: InfoDocumento) {
    if (info.anotaciones.includes(tipo)) return;
    const { error } = await bd.rpc('registrar_anotacion_documento', {
      p_proveedor: idProveedor,
      p_proveedor_documento_id: documentoId,
      p_tipo: tipo,
    });
    if (error) fallo(error, 'anotación');
    resultado.anotados += 1;
  }

  async function aplicar(observado: DocumentoObservado, info: InfoDocumento) {
    if (observado.situacion === 'borrador' || observado.situacion === 'borrado_sin_aprobar') {
      if (observado.situacion === 'borrado_sin_aprobar') {
        await anotar(observado.documentoId, 'borrado_sin_aprobar', info);
      }
      return;
    }

    if (!('hechos' in observado)) return;
    const h = observado.hechos;
    const { error } = await bd.rpc('registrar_factura_espejo', {
      p_proveedor: idProveedor,
      p_proveedor_documento_id: observado.documentoId,
      p_numero: h.numero,
      p_fecha_expedicion: h.fechaExpedicion,
      p_base_centimos: h.baseCentimos,
      p_cuota_iva_centimos: h.cuotaIvaCentimos,
      p_total_centimos: h.totalCentimos,
      p_url_proveedor: h.enlace,
    });
    if (error) {
      if (error.code !== '23505') fallo(error, 'espejo');
      // Los datos del programa ya no coinciden con los copiados: se avisa, no se pisa.
      const { error: errorAviso } = await bd.rpc('notificar_discrepancia_facturacion', {
        p_proveedor: idProveedor,
        p_proveedor_documento_id: observado.documentoId,
      });
      if (errorAviso) fallo(errorAviso, 'aviso');
      resultado.discrepancias += 1;
    } else if (!info.tieneEspejo) {
      resultado.copiados += 1;
    }

    if (observado.situacion === 'rectificado' || observado.situacion === 'anulado') {
      await anotar(observado.documentoId, observado.situacion, info);
    }
  }

  // Pasada A: los envíos que aún no tienen espejo ni borrado sin aprobar.
  const pendientes = await bd.rpc('documentos_para_sincronizar', {
    p_proveedor: idProveedor,
    p_limite: LIMITE_PASADA_A,
  });
  if (pendientes.error) fallo(pendientes.error, 'pendientes');
  for (const doc of pendientes.data ?? []) {
    const observado = await proveedor.consultarDocumento(doc.proveedor_documento_id);
    await aplicar(observado, { tieneEspejo: doc.tiene_espejo, anotaciones: doc.anotaciones });
  }

  // Pasada B: lo que cambió en el programa desde el cursor. Solo cuenta lo que tiene envío nuestro;
  // el resto son facturas hechas directamente en el programa.
  const cursor = await bd.rpc('avanzar_cursor_sincronizacion', {});
  if (cursor.error) fallo(cursor.error, 'cursor');
  const desde = cursor.data ? new Date(cursor.data) : new Date(dep.ahora.getTime() - UN_DIA_MS);
  const lista = await proveedor.listarDocumentosDesde(desde);
  if (lista.length > 0) {
    const nuestros = await bd.rpc('documentos_para_sincronizar', {
      p_proveedor: idProveedor,
      p_ids: lista.map((d) => d.documentoId),
      p_limite: lista.length,
    });
    if (nuestros.error) fallo(nuestros.error, 'conocidos');
    const porId = new Map((nuestros.data ?? []).map((d) => [d.proveedor_documento_id, d]));
    for (const observado of lista) {
      const doc = porId.get(observado.documentoId);
      if (!doc) continue;
      await aplicar(observado, { tieneEspejo: doc.tiene_espejo, anotaciones: doc.anotaciones });
    }
  }

  const { error } = await bd.rpc('avanzar_cursor_sincronizacion', {
    p_hasta: new Date(dep.ahora.getTime() - MARGEN_DEL_CURSOR_MS).toISOString(),
  });
  if (error) fallo(error, 'cursor');

  return resultado;
}
