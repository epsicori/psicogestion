import { describe, expect, it } from 'vitest';

import { colocarPanel, limitesHorizontales, RADIO_PANEL, type Rect } from './colocacion';

const VENTANA: Rect = { top: 0, left: 0, width: 1280, height: 800 };
const PANEL = { width: 320, height: 240 };
const MARGEN = 8;
const PICO = 8;

function celda(top: number, left: number, width = 100, height = 40): Rect {
  return { top, left, width, height };
}

describe('colocarPanel', () => {
  it('con sitio debajo, sale debajo, centrado en el ancla y con el pico en su centro', () => {
    const ancla = celda(100, 500);
    const c = colocarPanel({ ancla, panel: PANEL, limites: VENTANA, margen: MARGEN, pico: PICO });
    expect(c.lado).toBe('abajo');
    expect(c.top).toBe(100 + 40 + PICO);
    expect(c.left).toBe(550 - 160);
    expect(c.picoX).toBe(160);
    expect(c.altoMax).toBeGreaterThanOrEqual(PANEL.height);
  });

  it('ancla en la última fila: sale arriba', () => {
    const ancla = celda(700, 500);
    const c = colocarPanel({ ancla, panel: PANEL, limites: VENTANA, margen: MARGEN, pico: PICO });
    expect(c.lado).toBe('arriba');
    expect(c.top).toBe(700 - PICO - PANEL.height);
    expect(c.top + PANEL.height + PICO).toBe(ancla.top);
  });

  it('ancla en la última columna: el panel queda entero y el pico apunta al ancla', () => {
    const ancla = celda(100, 1180);
    const c = colocarPanel({ ancla, panel: PANEL, limites: VENTANA, margen: MARGEN, pico: PICO });
    expect(c.left + PANEL.width).toBe(1280 - MARGEN);
    // Centro del ancla (1230) menos el borde izquierdo del panel.
    expect(c.picoX).toBe(1230 - c.left);
    expect(c.picoX).toBeLessThanOrEqual(PANEL.width - RADIO_PANEL - PICO);
  });

  it('ancla en la primera columna: recortado a la izquierda y pico recortado al radio', () => {
    const ancla = celda(100, 0, 20);
    const c = colocarPanel({ ancla, panel: PANEL, limites: VENTANA, margen: MARGEN, pico: PICO });
    expect(c.left).toBe(MARGEN);
    // El centro del ancla (10) queda a 2 px del borde: el pico no puede salir de la esquina redondeada.
    expect(c.picoX).toBe(RADIO_PANEL + PICO);
  });

  it('360×640 y un panel más alto que los dos huecos: el lado con más sitio, y altoMax', () => {
    const movil: Rect = { top: 0, left: 0, width: 360, height: 640 };
    const alto = { width: 320, height: 500 };
    const ancla = celda(250, 100); // arriba 250, abajo 350
    const c = colocarPanel({ ancla, panel: alto, limites: movil, margen: MARGEN, pico: PICO });
    expect(c.lado).toBe('abajo');
    expect(c.altoMax).toBe(640 - 290 - PICO - MARGEN);
    expect(c.top).toBe(290 + PICO);
    expect(c.left).toBe(MARGEN); // centro del ancla 150 − 160 = −10, recortado a [8, 32]
  });

  it('sin sitio en ninguno y más hueco arriba: sale arriba con el alto recortado', () => {
    const movil: Rect = { top: 0, left: 0, width: 360, height: 640 };
    const alto = { width: 320, height: 500 };
    const ancla = celda(400, 100); // arriba 400, abajo 200
    const c = colocarPanel({ ancla, panel: alto, limites: movil, margen: MARGEN, pico: PICO });
    expect(c.lado).toBe('arriba');
    expect(c.altoMax).toBe(400 - PICO - MARGEN);
    expect(c.top).toBe(MARGEN);
  });

  it('ancla más ancha que el panel: centrado y pico en el centro', () => {
    const ancla = celda(100, 200, 600);
    const c = colocarPanel({ ancla, panel: PANEL, limites: VENTANA, margen: MARGEN, pico: PICO });
    expect(c.left).toBe(500 - 160);
    expect(c.picoX).toBe(160);
  });

  it('respeta límites desplazados (el calendario no empieza en 0)', () => {
    const limites: Rect = { top: 0, left: 240, width: 800, height: 800 };
    const ancla = celda(100, 240, 40);
    const c = colocarPanel({ ancla, panel: PANEL, limites, margen: MARGEN, pico: PICO });
    expect(c.left).toBe(240 + MARGEN);
  });
});

describe('limitesHorizontales', () => {
  it('el calendario ancho manda; el estrecho cede a la ventana (360 px: calendario en 37 + 323)', () => {
    expect(limitesHorizontales({ contenedor: { left: 300, width: 700 }, ventana: 1280, panelAncho: 320 })).toEqual({
      left: 300,
      width: 700,
    });
    expect(limitesHorizontales({ contenedor: { left: 37, width: 323 }, ventana: 360, panelAncho: 320 })).toEqual({
      left: 0,
      width: 360,
    });
    expect(limitesHorizontales({ contenedor: null, ventana: 360, panelAncho: 320 })).toEqual({ left: 0, width: 360 });
  });

  it('con ellos, el panel de 320 px en 360 px queda entre 8 y 32 px, nunca fuera', () => {
    const l = limitesHorizontales({ contenedor: { left: 37, width: 323 }, ventana: 360, panelAncho: 320 });
    const c = colocarPanel({
      ancla: celda(300, 330, 28, 28),
      panel: { width: 320, height: 240 },
      limites: { top: 0, left: l.left, width: l.width, height: 640 },
    });
    expect(c.left).toBe(32);
    expect(c.left + 320).toBeLessThanOrEqual(360 - MARGEN);
  });
});
