'use client';

import { Building2 } from 'lucide-react';
import { useRef } from 'react';

import { t } from '@/lib/i18n';

import { elegirCentro } from '@/app/(app)/acciones';

export type CentroDelUsuario = { id: string; nombre: string };

/**
 * Selector de **centro**, no de organización. Es el **choque 1** de
 * `docs/interfaz.md`: el prototipo dibuja un desplegable titulado «Organización»,
 * y está mal —la topología es instancia dedicada, `organizacion` tiene
 * exactamente una fila y no hay nada entre lo que elegir—. El nombre de la
 * organización es un rótulo fijo; lo que sí varía es el centro.
 *
 * **Con menos de dos centros no se pinta nada.** Un desplegable de un solo
 * elemento es un control sin acción detrás, y eso está prohibido: quien pasa
 * consulta en un solo sitio no tiene nada que elegir.
 *
 * Se envía al cambiar, sin botón: un «Guardar» para una preferencia de una sola
 * elección es un paso de más. El desplegable vive dentro de un formulario de
 * verdad con su Server Action, así que sigue funcionando si el JavaScript aún no
 * ha llegado — `requestSubmit()` solo mejora lo que ya funcionaba.
 */
export function SelectorDeCentro({
  centros,
  activo,
}: {
  centros: CentroDelUsuario[];
  activo: string;
}) {
  const formulario = useRef<HTMLFormElement>(null);

  if (centros.length < 2) return null;

  return (
    <form ref={formulario} action={elegirCentro} className="px-3 pb-4">
      <label htmlFor="centro" className="text-muted-foreground block pb-1.5 text-[11px] font-semibold tracking-[0.16em] uppercase">
        {t('armazon.centroActivo')}
      </label>
      <div className="relative">
        <Building2 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <select
          id="centro"
          name="centro"
          defaultValue={activo}
          title={t('armazon.cambiarCentro')}
          onChange={() => formulario.current?.requestSubmit()}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-10 w-full rounded-lg border pl-9 text-sm outline-none focus-visible:ring-2"
        >
          {centros.map((centro) => (
            <option key={centro.id} value={centro.id}>
              {centro.nombre}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
