// T-026a. Proveedor en memoria, SOLO para pruebas. Ningún fichero que no sea `*.test.ts` lo importa
// (lo comprueba `importaciones.test.ts`). Sirve para ejercitar la cola y el sincronizador sin red:
// caída, respuesta perdida (el documento se crea pero el llamante no lo sabe) y los cambios que hace
// una persona en el programa (aprobar, borrar, anular, rectificar).

import {
  ErrorProveedor,
  type BorradorProyectado,
  type DocumentoObservado,
  type FichaProveedor,
  type HechosDeExpedicion,
  type ProveedorFacturacion,
} from './proveedor';

interface Documento {
  id: string;
  recibido: BorradorProyectado;
  situacion: 'borrador' | 'borrado_sin_aprobar' | 'aprobado' | 'rectificado' | 'anulado';
  hechos: HechosDeExpedicion | null;
}

export interface ControlSimulado {
  /** Con `true`, las tres operaciones lanzan `ErrorProveedor('red')`. */
  caido(valor: boolean): void;
  /** La siguiente `crearBorrador` crea el documento y lanza `ErrorProveedor('ambiguo')`. */
  perderRespuesta(): void;
  documentos(): readonly { id: string; recibido: BorradorProyectado; situacion: string }[];
  aprobar(id: string, hechos: HechosDeExpedicion): void;
  borrar(id: string): void;
  anular(id: string): void;
  rectificar(id: string): void;
  cambiarHechos(id: string, hechos: HechosDeExpedicion): void;
}

function observar(d: Documento): DocumentoObservado {
  if (d.situacion === 'borrador' || d.situacion === 'borrado_sin_aprobar') {
    return { documentoId: d.id, situacion: d.situacion };
  }
  if (!d.hechos) throw new Error('Documento simulado sin hechos.');
  return { documentoId: d.id, situacion: d.situacion, hechos: d.hechos };
}

export function crearProveedorSimulado(): {
  proveedor: ProveedorFacturacion;
  ficha: FichaProveedor;
  control: ControlSimulado;
} {
  const docs = new Map<string, Documento>();
  let caido = false;
  let perder = false;
  let contador = 0;

  function exigirDisponible() {
    if (caido) throw new ErrorProveedor('red');
  }
  function documento(id: string): Documento {
    const d = docs.get(id);
    if (!d) throw new Error(`Documento simulado desconocido: ${id}`);
    return d;
  }

  const proveedor: ProveedorFacturacion = {
    async crearBorrador(b) {
      exigirDisponible();
      contador += 1;
      const id = `SIM-${contador}`;
      docs.set(id, { id, recibido: structuredClone(b), situacion: 'borrador', hechos: null });
      if (perder) {
        perder = false;
        throw new ErrorProveedor('ambiguo');
      }
      return { documentoId: id };
    },
    async consultarDocumento(id) {
      exigirDisponible();
      const d = docs.get(id);
      if (!d) throw new ErrorProveedor('rechazado');
      return observar(d);
    },
    async listarDocumentosDesde() {
      exigirDisponible();
      return [...docs.values()].map(observar);
    },
  };

  const ficha: FichaProveedor = {
    id: 'holded',
    nombre: 'Programa simulado',
    disponible: true,
    enlaceDeBorrador: (id) => `https://simulado.example/borrador/${id}`,
  };

  const control: ControlSimulado = {
    caido: (v) => {
      caido = v;
    },
    perderRespuesta: () => {
      perder = true;
    },
    documentos: () =>
      [...docs.values()].map((d) => ({ id: d.id, recibido: d.recibido, situacion: d.situacion })),
    aprobar: (id, hechos) => {
      const d = documento(id);
      d.situacion = 'aprobado';
      d.hechos = hechos;
    },
    borrar: (id) => {
      documento(id).situacion = 'borrado_sin_aprobar';
    },
    anular: (id) => {
      documento(id).situacion = 'anulado';
    },
    rectificar: (id) => {
      documento(id).situacion = 'rectificado';
    },
    cambiarHechos: (id, hechos) => {
      documento(id).hechos = hechos;
    },
  };

  return { proveedor, ficha, control };
}
