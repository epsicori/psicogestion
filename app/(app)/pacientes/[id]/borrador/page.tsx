import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';

import { ContenidoEditor } from './contenido';

/**
 * `/pacientes/<uuid>/borrador`: un borrador nuevo (T-046). No es `async`: lo que depende de la
 * petición va detrás de `<Suspense>` (Cache Components).
 */
export default function PaginaNuevoBorrador({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Cargando filas={5} />}>
      <ContenidoEditor params={params} />
    </Suspense>
  );
}
