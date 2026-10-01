/**
 * Dónde colocar un panel anclado a un elemento (T-014 §1.5). Pura: recibe
 * rectángulos ya medidos y no toca el DOM, para poder probar los bordes (la
 * última fila, la última columna, un teléfono de 360×640) sin navegador.
 */

export type Rect = { top: number; left: number; width: number; height: number };

export type Colocacion = {
  top: number;
  left: number;
  lado: 'arriba' | 'abajo';
  /** Distancia del pico al borde izquierdo del panel. */
  picoX: number;
  /** Alto que cabe en el lado elegido; si el panel es más alto, hace scroll por dentro. */
  altoMax: number;
};

/** El radio de `rounded-xl`: el pico no puede salir de la esquina redondeada. */
export const RADIO_PANEL = 12;

const MARGEN_POR_DEFECTO = 8;
const PICO_POR_DEFECTO = 8;

function recortar(valor: number, minimo: number, maximo: number): number {
  // Si el panel no cabe entre los límites, manda el mínimo: mejor cortado a la
  // derecha que con el principio fuera de la pantalla.
  return Math.max(minimo, Math.min(valor, maximo));
}

/**
 * Los límites horizontales del panel: el calendario, y la ventana cuando el calendario no deja
 * sitio para el panel con su margen a cada lado (un teléfono de 360 px, donde el calendario
 * empieza a unos 37 px del borde y `recortar` pegaría el panel a su izquierda, fuera de la
 * pantalla por la derecha). Con el panel ya acotado a la ventana (`min(20rem, 100vw - 2rem)`),
 * en la ventana siempre cabe con margen.
 */
export function limitesHorizontales({
  contenedor,
  ventana,
  panelAncho,
  margen = MARGEN_POR_DEFECTO,
}: {
  contenedor: { left: number; width: number } | null;
  ventana: number;
  panelAncho: number;
  margen?: number;
}): { left: number; width: number } {
  if (contenedor) {
    const izquierda = Math.max(0, contenedor.left);
    const derecha = Math.min(ventana, contenedor.left + contenedor.width);
    if (derecha - izquierda >= panelAncho + 2 * margen) return { left: izquierda, width: derecha - izquierda };
  }
  return { left: 0, width: ventana };
}

export function colocarPanel({
  ancla,
  panel,
  limites,
  margen = MARGEN_POR_DEFECTO,
  pico = PICO_POR_DEFECTO,
}: {
  ancla: Rect;
  panel: { width: number; height: number };
  limites: Rect;
  margen?: number;
  pico?: number;
}): Colocacion {
  const huecoAbajo = limites.top + limites.height - (ancla.top + ancla.height);
  const huecoArriba = ancla.top - limites.top;
  const necesario = panel.height + pico + margen;

  const lado: Colocacion['lado'] =
    huecoAbajo >= necesario
      ? 'abajo'
      : huecoArriba >= necesario
        ? 'arriba'
        : huecoAbajo >= huecoArriba
          ? 'abajo'
          : 'arriba';

  const altoMax = Math.max(0, (lado === 'abajo' ? huecoAbajo : huecoArriba) - pico - margen);
  const alto = Math.min(panel.height, altoMax);
  const top = lado === 'abajo' ? ancla.top + ancla.height + pico : ancla.top - pico - alto;

  const centroAncla = ancla.left + ancla.width / 2;
  const left = recortar(
    centroAncla - panel.width / 2,
    limites.left + margen,
    limites.left + limites.width - margen - panel.width,
  );
  const picoX = recortar(centroAncla - left, RADIO_PANEL + pico, panel.width - RADIO_PANEL - pico);

  return { top, left, lado, picoX, altoMax };
}

/** La parte de `rect` que se ve en una ventana de alto `alto` (solo en vertical). */
export function visibleEnVentana(rect: Rect, alto: number): Rect {
  const top = Math.max(0, rect.top);
  const abajo = Math.min(alto, rect.top + rect.height);
  return { ...rect, top, height: Math.max(0, abajo - top) };
}

/**
 * Último recurso cuando el panel no cabe ni encima ni debajo del ancla (un calendario más alto
 * que la ventana, sin otra referencia): centrado en vertical y visible en la ventana, con el
 * pico en el centro del panel. Revisión B2-3.
 */
export function centrarEnVentana({
  ancla,
  panel,
  limites,
  margen = MARGEN_POR_DEFECTO,
}: {
  ancla: Rect;
  panel: { width: number; height: number };
  limites: Rect;
  margen?: number;
}): Colocacion {
  const altoMax = Math.max(0, limites.height - 2 * margen);
  const alto = Math.min(panel.height, altoMax);
  const top = limites.top + (limites.height - alto) / 2;
  const left = recortar(
    ancla.left + ancla.width / 2 - panel.width / 2,
    limites.left + margen,
    limites.left + limites.width - margen - panel.width,
  );
  return { top, left, lado: 'abajo', picoX: panel.width / 2, altoMax };
}
