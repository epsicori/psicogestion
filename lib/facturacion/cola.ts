// T-026a. El consumidor del outbox: reclama los envíos pendientes, proyecta cada borrador, lo crea en
// el programa de facturación y registra el resultado. SOLO crea borradores (ADR-053): la interfaz del
// proveedor no tiene otra operación de escritura.
//
// Registra únicamente `console.error('[facturacion] envio', codigo)`: nunca el error, la fila, la
// proyección ni la clave.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/tipos-bd';

import { PROYECCION_VERSION, proyectarBorrador } from './proyeccion';
import {
  ErrorProveedor,
  type CodigoErrorProveedor,
  type IdProveedor,
  type ProveedorFacturacion,
} from './proveedor';

type Reclamada = Database['public']['Functions']['reclamar_envios_facturacion']['Returns'][number];

/**
 * Una fila de `reclamar_envios_facturacion`. El generador de tipos no marca como nulas las columnas
 * del NIF cifrado ni `ya_enviado_documento_id`; aquí sí.
 */
export type FilaReclamada = Omit<
  Reclamada,
  | 'destinatario_nif_cifrado'
  | 'destinatario_nif_nonce'
  | 'destinatario_nif_etiqueta'
  | 'destinatario_nif_clave_version'
  | 'ya_enviado_documento_id'
> & {
  destinatario_nif_cifrado: string | null;
  destinatario_nif_nonce: string | null;
  destinatario_nif_etiqueta: string | null;
  destinatario_nif_clave_version: number | null;
  ya_enviado_documento_id: string | null;
};

export interface DependenciasDrenado {
  /** Cliente de servicio: las funciones de la cola solo las ejecuta `service_role`. */
  bd: SupabaseClient<Database>;
  proveedor: ProveedorFacturacion;
  idProveedor: IdProveedor;
  descifrarNif: (fila: FilaReclamada) => Promise<string | null>;
  limite?: number;
}

export interface ResultadoDrenado {
  enviados: number;
  reintentos: number;
  fallidos: number;
}

const INTENTOS_DE_REGISTRO = 3;

async function registrarEnvio(
  dep: DependenciasDrenado,
  fila: FilaReclamada,
  documentoId: string,
): Promise<boolean> {
  for (let intento = 0; intento < INTENTOS_DE_REGISTRO; intento += 1) {
    const { error } = await dep.bd.rpc('registrar_envio_borrador', {
      p_evento_id: fila.evento_id,
      p_proveedor: dep.idProveedor,
      p_documento_id: documentoId,
      p_proyeccion_version: PROYECCION_VERSION,
      p_version_id: fila.version_id,
      p_fecha_documento: fila.fecha_documento,
    });
    if (!error) return true;
  }
  return false;
}

async function registrarFallo(
  dep: DependenciasDrenado,
  fila: FilaReclamada,
  codigo: CodigoErrorProveedor,
  permanente: boolean,
): Promise<void> {
  console.error('[facturacion] envio', codigo);
  await dep.bd.rpc('registrar_fallo_envio_facturacion', {
    p_evento_id: fila.evento_id,
    p_codigo: codigo,
    p_permanente: permanente,
  });
}

export async function drenarEnvios(dep: DependenciasDrenado): Promise<ResultadoDrenado> {
  const resultado: ResultadoDrenado = { enviados: 0, reintentos: 0, fallidos: 0 };

  const { data, error } = await dep.bd.rpc('reclamar_envios_facturacion', {
    p_limite: dep.limite ?? 10,
  });
  if (error) {
    console.error('[facturacion] envio', 'reclamo');
    return resultado;
  }

  for (const fila of (data ?? []) as FilaReclamada[]) {
    try {
      // Ya hay documento: solo falta dejar constancia (idempotente) y entregar el evento.
      if (fila.ya_enviado_documento_id) {
        if (await registrarEnvio(dep, fila, fila.ya_enviado_documento_id)) {
          resultado.enviados += 1;
        } else {
          resultado.reintentos += 1;
        }
        continue;
      }

      const nif = await dep.descifrarNif(fila);
      const proyectado = proyectarBorrador(fila, nif);
      const { documentoId } = await dep.proveedor.crearBorrador(proyectado);

      if (await registrarEnvio(dep, fila, documentoId)) {
        resultado.enviados += 1;
      } else {
        // El documento existe y no pudimos anotarlo: un humano lo comprueba en el programa antes de
        // volver a prepararlo. Crear otro sería un duplicado.
        await registrarFallo(dep, fila, 'ambiguo', true);
        resultado.fallidos += 1;
      }
    } catch (e) {
      if (e instanceof ErrorProveedor) {
        await registrarFallo(dep, fila, e.codigo, !e.reintentable);
        if (e.reintentable) resultado.reintentos += 1;
        else resultado.fallidos += 1;
      } else {
        await registrarFallo(dep, fila, 'rechazado', true);
        resultado.fallidos += 1;
      }
    }
  }
  return resultado;
}
