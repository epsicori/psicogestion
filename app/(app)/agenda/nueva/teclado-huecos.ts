import type { KeyboardEvent } from 'react';

/** Los huecos libres de un contenedor, en el orden del documento. */
function huecosDe(contenedor: ParentNode | null): HTMLElement[] {
  return contenedor ? Array.from(contenedor.querySelectorAll<HTMLElement>('button[data-hueco]')) : [];
}

/** Enfoca el primer hueco libre del contenedor. Devuelve si había alguno. */
export function enfocarPrimerHueco(contenedor: ParentNode | null): boolean {
  const primero = huecosDe(contenedor)[0];
  primero?.focus();
  return primero !== undefined;
}

/**
 * Teclado de un hueco libre en modo selección (T-028 B, H10). Los huecos no son parada de Tab: la
 * parada es el día activo, y desde él Flecha abajo entra en sus huecos. Aquí, dentro: arriba y
 * abajo recorren los del día (arriba desde el primero vuelve al día), Inicio y Fin saltan a los
 * extremos, Escape vuelve al día, y las flechas laterales pasan al día vecino si la rejilla lo
 * pide (`alLado`). Lo que no es de este patrón se deja pasar (Tab sale; Intro y Espacio eligen).
 */
export function alTeclearHueco(
  evento: KeyboardEvent<HTMLElement>,
  opciones: { contenedor: ParentNode | null; dia: HTMLElement | null; alLado?: (delta: -1 | 1) => HTMLElement | null },
): void {
  const huecos = huecosDe(opciones.contenedor);
  const indice = huecos.indexOf(evento.currentTarget);
  const enfocar = (destino: HTMLElement | null | undefined) => {
    if (!destino) return;
    evento.preventDefault();
    destino.focus();
  };

  switch (evento.key) {
    case 'ArrowDown':
      enfocar(huecos[indice + 1]);
      break;
    case 'ArrowUp':
      enfocar(indice > 0 ? huecos[indice - 1] : opciones.dia);
      break;
    case 'Home':
      enfocar(huecos[0]);
      break;
    case 'End':
      enfocar(huecos[huecos.length - 1]);
      break;
    case 'Escape':
      enfocar(opciones.dia);
      break;
    case 'ArrowLeft':
      enfocar(opciones.alLado?.(-1));
      break;
    case 'ArrowRight':
      enfocar(opciones.alLado?.(1));
      break;
  }
}
