// T-026a. El ÚNICO fichero de código TS con el nombre del programa (aparte del registro, que lo importa).
// En T-026a es un esqueleto: los tres métodos lanzan `no_disponible` y `disponible` es falso, así que
// la app entera funciona en modo degradado. La implementación con red es T-026b.
//
// ADR-053 (b) y aclaración 4 de la AEAT: la app nunca aprueba. Sin parámetro, sin ajuste, sin bandera.
// En T-026b, todo `fetch` llevará `cache: 'no-store'`, usará el `fetch` inyectado, y la clave irá solo
// en la cabecera que el programa indique: nunca en la URL, nunca en un mensaje de error y nunca en un
// `console.*`.

import {
  ErrorProveedor,
  type FichaProveedor,
  type ProveedorFacturacion,
} from './proveedor';

const APPROVE_DOC = false as const;
void APPROVE_DOC;

export const fichaHolded: FichaProveedor = {
  id: 'holded',
  nombre: 'Holded',
  disponible: false,
  enlaceDeBorrador: () => null,
};

export function crearProveedorHolded(opciones: {
  clave: string;
  fetch?: typeof fetch;
}): ProveedorFacturacion {
  void opciones;
  return {
    async crearBorrador() {
      throw new ErrorProveedor('no_disponible');
    },
    async consultarDocumento() {
      throw new ErrorProveedor('no_disponible');
    },
    async listarDocumentosDesde() {
      throw new ErrorProveedor('no_disponible');
    },
  };
}
