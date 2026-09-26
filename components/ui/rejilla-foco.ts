'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * Navegación con flechas en una rejilla (el mes, la tira de días): el patrón
 * «grid» de WAI-ARIA. A diferencia de `indiceSiguiente` de `foco.ts`, pensado
 * para menús y pestañas, aquí NO se da la vuelta: en el borde la flecha no
 * hace nada, porque saltar del domingo al lunes de la semana siguiente es
 * otra dirección, no «la siguiente celda».
 */
export function destinoEnRejilla(tecla: string, indice: number, total: number, columnas = 7): number | null {
  const columna = indice % columnas;
  const inicioFila = indice - columna;

  let destino: number;
  switch (tecla) {
    case 'ArrowRight':
      if (columna === columnas - 1) return null;
      destino = indice + 1;
      break;
    case 'ArrowLeft':
      if (columna === 0) return null;
      destino = indice - 1;
      break;
    case 'ArrowDown':
      destino = indice + columnas;
      break;
    case 'ArrowUp':
      destino = indice - columnas;
      break;
    case 'Home':
      destino = inicioFila;
      break;
    case 'End':
      destino = Math.min(inicioFila + columnas - 1, total - 1);
      break;
    default:
      return null;
  }

  return destino >= 0 && destino < total ? destino : null;
}

/**
 * Tabulación móvil sobre una rejilla: una sola celda tabulable (`activo`), las
 * flechas la mueven y el foco la sigue. No enfoca al montar: entrar en la
 * página no debe robarle el foco a nadie.
 */
export function useFocoRodante(total: number, inicial: number, columnas = 7) {
  const [activo, setActivo] = useState(inicial);
  const elementos = useRef<(HTMLElement | null)[]>([]);
  const moverFoco = useRef(false);

  useEffect(() => {
    if (!moverFoco.current) return;
    moverFoco.current = false;
    elementos.current[activo]?.focus();
  }, [activo]);

  const alTeclear = useCallback(
    (evento: KeyboardEvent) => {
      const destino = destinoEnRejilla(evento.key, activo, total, columnas);
      if (destino === null) return;
      evento.preventDefault();
      moverFoco.current = true;
      setActivo(destino);
    },
    [activo, total, columnas],
  );

  const refDe = useCallback(
    (indice: number) => (elemento: HTMLElement | null) => {
      elementos.current[indice] = elemento;
    },
    [],
  );

  return { activo, setActivo, alTeclear, refDe };
}
