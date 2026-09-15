import type { ReactNode } from 'react';

import { EstadoVacio } from '@/components/ui/piezas';

/**
 * Las tres piezas que repiten las pestañas de la ficha. No son primitivas de interfaz —esas
 * están en `components/ui/` y se escriben en T-007—: son la maqueta concreta de esta
 * pantalla, y viven aquí para que las cuatro pestañas se parezcan entre sí sin copiarse.
 */

/** Tarjeta con título. Un bloque sin nada legible dentro **no se pinta** (choque 5). */
export function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-border bg-card rounded-xl border p-5 shadow-sm">
      <h3 className="font-serif text-lg font-semibold">{titulo}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Rótulo en versalita y valor debajo, como en la cabecera. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {etiqueta}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/**
 * Hueco honesto, con la primitiva `EstadoVacio` de T-007. Sirve para dos cosas que **no son
 * lo mismo** y por eso la frase se pasa desde fuera: «no hay nada» y «no puedes verlo».
 */
export function Vacio({
  icono,
  frase,
  explicacion,
}: {
  icono: ReactNode;
  frase: string;
  explicacion: string;
}) {
  return (
    <div className="px-2 py-8">
      <EstadoVacio icono={icono} frase={frase} explicacion={explicacion} />
    </div>
  );
}
