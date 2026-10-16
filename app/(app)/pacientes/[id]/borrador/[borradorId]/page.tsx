import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';

import { ContenidoEditor } from '../contenido';

/**
 * `/pacientes/[id]/borrador/[borradorId]`: corregir un borrador (T-046). Una versión nueva completa a
 * partir de la última; si está descartado o ya preparado en el programa, solo lectura.
 */
export default function PaginaCorregirBorrador({
  params,
}: {
  params: Promise<{ id: string; borradorId: string }>;
}) {
  return (
    <Suspense fallback={<Cargando filas={5} />}>
      <ContenidoEditor params={params} />
    </Suspense>
  );
}
