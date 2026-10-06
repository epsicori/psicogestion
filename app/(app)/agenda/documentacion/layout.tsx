import type { ReactNode } from 'react';

import { MemoriaResolucion } from '../resolver-alerta';

/**
 * La memoria de la resolución de /agenda/documentacion (T-048, ronda 3, R2-H1). Un layout no se
 * remonta al navegar ni al redirigir de `?pagina`, y queda por encima del límite de redirección de
 * Next y de la `key` del buscador: es la única pieza propia que sobrevive a los dos desmontajes de
 * la página. No es `async`, no lee nada y no pinta nada visible: solo la región `sr-only` del aviso.
 */
export default function LayoutDocumentacion({ children }: { children: ReactNode }) {
  return <MemoriaResolucion>{children}</MemoriaResolucion>;
}
