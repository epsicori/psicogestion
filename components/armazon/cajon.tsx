'use client';

import { createContext, useContext } from 'react';

/**
 * Cierre del cajón de navegación en móvil.
 *
 * Es un contexto y no una prop porque la navegación **ya no es hija directa** del
 * armazón de cliente: desde T-007·D depende del rol, así que la resuelve un bloque
 * de servidor y llega como ranura. Una función no cruza esa frontera; el contexto
 * sí, porque viaja por posición en el árbol de React y no por importación.
 *
 * La alternativa —cerrar con un `useEffect` al cambiar de ruta— la rechaza ESLint
 * (`react-hooks/set-state-in-effect`) y con razón: cerrar el cajón es la
 * consecuencia de un gesto del usuario, no de que la ruta cambie sola.
 */
export const CajonContext = createContext<() => void>(() => {});

export function useCerrarCajon() {
  return useContext(CajonContext);
}
