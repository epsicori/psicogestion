// T-026a. La proyección: de la versión sellada de un borrador a lo que viaja al programa de
// facturación. LISTA BLANCA: el objeto de salida se construye campo a campo. Prohibido el spread y
// `Object.assign` sobre la entrada, que arrastrarían campos clínicos que algún día alguien añada.
// Hay dos capas: la RPC SQL no devuelve `concepto` ni `cita_id`, y esta función los ignoraría aunque
// llegaran.

import { comprobarCentimos } from '@/lib/dinero/importe';
import type { RegimenIva } from '@/lib/dinero/iva';

import type { FilaReclamada } from './cola';
import { conceptoGenerico } from './conceptos';
import type { BorradorProyectado, LineaProyectada } from './proveedor';

/** Se sube si cambia lo que sale; se guarda en el envío. */
export const PROYECCION_VERSION = 1;

/** La entrada de la proyección: lo que devuelve `reclamar_envios_facturacion`. */
export type VersionParaProyectar = FilaReclamada;

function esRegimen(valor: unknown): valor is RegimenIva {
  return valor === 'exento_sanitario' || valor === 'general';
}

function lineaProyectada(bruta: unknown): LineaProyectada {
  if (typeof bruta !== 'object' || bruta === null) {
    throw new Error('Línea de borrador no válida.');
  }
  const l = bruta as Record<string, unknown>;
  const cantidad = l.cantidad;
  const precio = l.precio_unitario_centimos;
  const regimen = l.regimen_iva;
  const tipo = l.tipo_iva_centesimas;

  if (typeof cantidad !== 'number' || !Number.isSafeInteger(cantidad) || cantidad <= 0) {
    throw new Error('La cantidad de una línea ha de ser un entero positivo.');
  }
  if (typeof precio !== 'number') {
    throw new Error('El precio de una línea no es válido.');
  }
  comprobarCentimos(precio, 'El precio de una línea');
  if (!esRegimen(regimen)) {
    throw new Error('El régimen de IVA de una línea no es válido.');
  }
  if (typeof tipo !== 'number' || !Number.isSafeInteger(tipo) || tipo < 0) {
    throw new Error('El tipo de IVA de una línea no es válido.');
  }

  return {
    concepto: conceptoGenerico(regimen),
    cantidad,
    precioUnitarioCentimos: precio,
    regimenIva: regimen,
    tipoIvaCentesimas: tipo,
  };
}

export function proyectarBorrador(
  entrada: VersionParaProyectar,
  nifEnClaro: string | null,
): BorradorProyectado {
  const brutas = entrada.lineas;
  if (!Array.isArray(brutas) || brutas.length === 0) {
    throw new Error('El borrador no tiene líneas.');
  }
  return {
    destinatario: { nombre: entrada.destinatario_nombre, nif: nifEnClaro },
    fecha: entrada.fecha_documento,
    lineas: brutas.map(lineaProyectada),
  };
}
