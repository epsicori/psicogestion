import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';

import { ContenidoAlta } from '../../../agenda/nueva/contenido-alta';
import { DialogoAlta } from '../../../agenda/nueva/dialogo-alta';

type ParametrosDeBusqueda = Promise<Record<string, string | string[] | undefined>>;

/** El alta de cita sobre la agenda: la misma pantalla que `/agenda/nueva`, en un diálogo. */
export default function AltaEnDialogo({ searchParams }: { searchParams: ParametrosDeBusqueda }) {
  return (
    <DialogoAlta>
      <Suspense fallback={<Cargando filas={5} />}>
        <ContenidoAlta searchParams={searchParams} modo="dialogo" />
      </Suspense>
    </DialogoAlta>
  );
}
