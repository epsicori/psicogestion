import type { ReactNode } from 'react';

import { Tarjeta } from '@/components/ui/piezas';

/**
 * El marco de un bloque de la agenda: tarjeta y título. Lo pintan el bloque y su esqueleto,
 * así el título no salta al llegar los datos.
 */
export function MarcoBloque({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <Tarjeta className="p-4">
      <section aria-labelledby={id} className="flex flex-col gap-3">
        <h2 id={id} className="font-serif text-lg font-semibold text-foreground">
          {titulo}
        </h2>
        {children}
      </section>
    </Tarjeta>
  );
}
