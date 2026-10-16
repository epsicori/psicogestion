'use client';

import { AsignarCobro } from './asignar-cobro';
import { RegistrarCobro } from './registrar-cobro';

type Props = {
  factura: { id: string; numero: string; pacienteId: string; paciente: string };
  /** Cobros del paciente que aún no están en ninguna factura: sin ellos no hay nada que asignar. */
  cobrosSinFactura: number;
  zona: string;
  hoy: string;
};

/**
 * Las dos acciones de una fila de factura (T-023b): registrar un cobro contra ella y asignarle uno que ya existía.
 * Cada una lleva su diálogo y su región de estado; aquí solo se juntan.
 */
export function AccionesDeFactura({ factura, cobrosSinFactura, zona, hoy }: Props) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <RegistrarCobro pacientes={null} hoy={hoy} factura={factura} />
      <AsignarCobro
        factura={{ id: factura.id, numero: factura.numero }}
        zona={zona}
        disponible={cobrosSinFactura > 0}
      />
    </div>
  );
}
