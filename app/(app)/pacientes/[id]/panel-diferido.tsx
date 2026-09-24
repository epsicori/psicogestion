'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Cargando } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';

/**
 * Un panel de la ficha que **no existe en servidor hasta que se monta** (T-032, H2).
 *
 * Un Server Component pasado como prop a `FichaCliente` se renderiza en servidor aunque la
 * pestaña que lo enseña esté cerrada: React Server Components pinta todo el árbol que
 * recibe, y lo que el cliente no monta viaja igual en la carga útil. Para «Datos» eso
 * significaba llamar a `leer_identificacion()` —y dejar su rastro en `auditoria`, y mandar
 * el documento descifrado al navegador— en cada visita a la ficha, abriera nadie la
 * pestaña o no.
 *
 * Aquí `cargar` es una Server Function (definida en `page.tsx`) que devuelve el panel ya
 * renderizado. `FichaCliente` solo monta el panel activo, así que la función se llama
 * cuando, y solo cuando, alguien abre la pestaña. El HTML inicial lleva el esqueleto de
 * carga y nada más.
 */
// Alias y no el tipo de promesa escrito en línea tras la flecha: `lib/i18n/sin-literales.test.ts`
// tomaría la palabra entre la flecha y el genérico por texto de JSX.
type PanelCargado = Promise<ReactNode>;

export function PanelDiferido({ cargar }: { cargar: () => PanelCargado }) {
  const [contenido, setContenido] = useState<ReactNode>(null);
  const [fallo, setFallo] = useState(false);
  // Dedupe del doble montaje de StrictMode (el mismo patrón que `panel-historia.tsx`): en
  // desarrollo el efecto corre dos veces sobre el mismo componente y los refs sobreviven.
  const pedida = useRef(false);

  useEffect(() => {
    if (pedida.current) return;
    pedida.current = true;

    cargar().then(
      (nodo) => setContenido(nodo),
      (error: unknown) => {
        console.error('PanelDiferido: no se pudo cargar el panel', error);
        setFallo(true);
      },
    );
  }, [cargar]);

  if (fallo) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('ficha.noSePudoCargarLaFicha')}
      </p>
    );
  }

  return contenido ?? <Cargando filas={4} />;
}
