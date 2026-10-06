import type { ReactNode } from 'react';

import { Tarjeta } from '@/components/ui/piezas';

/**
 * El marco de un bloque de la agenda: tarjeta y título. Lo pintan el bloque y su esqueleto,
 * así el título no salta al llegar los datos.
 */
export function MarcoBloque({
  id,
  titulo,
  encabezadoEnfocable = false,
  children,
}: {
  id: string;
  titulo: string;
  /** T-048: el foco puede caer en el título cuando el bloque se queda sin filas. */
  encabezadoEnfocable?: boolean;
  children: ReactNode;
}) {
  return (
    <Tarjeta className="p-4">
      <section aria-labelledby={id} className="flex flex-col gap-3">
        <h2
          id={id}
          tabIndex={encabezadoEnfocable ? -1 : undefined}
          className={
            encabezadoEnfocable
              ? 'focus-visible:ring-ring/50 font-serif text-lg font-semibold text-foreground outline-none focus-visible:ring-2'
              : 'font-serif text-lg font-semibold text-foreground'
          }
        >
          {titulo}
        </h2>
        {children}
      </section>
    </Tarjeta>
  );
}
