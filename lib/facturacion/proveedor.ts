// T-026a, ADR-053 (e). La interfaz que separa nuestro dominio del programa de facturación externo.
// Sin red y sin dependencias: solo tipos y el error. Aquí NO hay `aprobar`, `expedir`, `emitir`,
// `anular`, `rectificar` ni `descargarPdf` (ADR-053 b, ADR-078 1): la app prepara borradores y el
// programa los expide. `DocumentoObservado` tampoco tiene estado de pago ni líneas (ADR-077).

import type { Centimos } from '@/lib/dinero/importe';
import type { RegimenIva } from '@/lib/dinero/iva';

/** Igual que el enum `proveedor_facturacion` de la base. */
export type IdProveedor = 'holded';

/** Solo sale de `conceptos.ts`. */
export type ConceptoGenerico = string;

export interface LineaProyectada {
  concepto: ConceptoGenerico;
  /** Entero > 0. */
  cantidad: number;
  precioUnitarioCentimos: Centimos;
  regimenIva: RegimenIva;
  /** 0 o 2100. */
  tipoIvaCentesimas: number;
}

export interface BorradorProyectado {
  destinatario: { nombre: string; nif: string | null };
  /** 'YYYY-MM-DD', hora local del centro. */
  fecha: string;
  lineas: readonly LineaProyectada[];
}

/** ADR-077 punto 7, «al aprobarse»; ni un campo más. */
export interface HechosDeExpedicion {
  numero: string;
  /** 'YYYY-MM-DD'. */
  fechaExpedicion: string;
  baseCentimos: Centimos;
  cuotaIvaCentimos: Centimos;
  totalCentimos: Centimos;
  /** https://… */
  enlace: string;
}

export type DocumentoObservado =
  | { documentoId: string; situacion: 'borrador' | 'borrado_sin_aprobar' }
  | {
      documentoId: string;
      situacion: 'aprobado' | 'rectificado' | 'anulado';
      hechos: HechosDeExpedicion;
    };

export interface ProveedorFacturacion {
  crearBorrador(b: BorradorProyectado): Promise<{ documentoId: string }>;
  consultarDocumento(documentoId: string): Promise<DocumentoObservado>;
  listarDocumentosDesde(desde: Date): Promise<readonly DocumentoObservado[]>;
}

/** Datos estáticos de un programa; no son operaciones. */
export interface FichaProveedor {
  id: IdProveedor;
  nombre: string;
  disponible: boolean;
  enlaceDeBorrador(documentoId: string): string | null;
}

export type CodigoErrorProveedor =
  // Reintentables: el documento NO se creó.
  | 'red'
  | 'limite'
  // Permanentes.
  | 'no_autorizado'
  | 'sin_plan'
  | 'rechazado'
  // La petición salió y no sabemos si creó el documento.
  | 'ambiguo'
  // Adaptador sin implementar.
  | 'no_disponible';

const MENSAJES: Record<CodigoErrorProveedor, string> = {
  red: 'No se pudo contactar con el programa de facturación.',
  limite: 'El programa de facturación pide esperar antes de otra petición.',
  no_autorizado: 'El programa de facturación no acepta la clave.',
  sin_plan: 'La cuenta del programa de facturación no permite conectar otras aplicaciones.',
  rechazado: 'El programa de facturación rechazó la petición.',
  ambiguo: 'No se sabe si el programa de facturación recibió la petición.',
  no_disponible: 'El programa de facturación todavía no está disponible.',
};

/**
 * El mensaje es FIJO por código: nunca incluye el cuerpo, las cabeceras ni la URL de la respuesta
 * del programa (podrían arrastrar la clave).
 */
export class ErrorProveedor extends Error {
  readonly codigo: CodigoErrorProveedor;
  /** Solo `red` y `limite`. */
  readonly reintentable: boolean;

  constructor(codigo: CodigoErrorProveedor) {
    super(MENSAJES[codigo]);
    this.name = 'ErrorProveedor';
    this.codigo = codigo;
    this.reintentable = codigo === 'red' || codigo === 'limite';
  }
}
