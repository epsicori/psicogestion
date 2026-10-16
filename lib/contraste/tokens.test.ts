import { describe, expect, it } from 'vitest';

import { PARES, UMBRAL_GRAFICO, describir, leerTokens, revisarTokens } from './tokens';

describe('Los tokens de app/globals.css cumplen AA sobre cada superficie donde se usan', () => {
  it('ningún par de la paleta baja de AA', () => {
    const fallos = revisarTokens();
    expect(fallos.length, `Pares por debajo de AA:\n${describir(fallos)}`).toBe(0);
  });

  it('todos los tokens nombrados en PARES existen de verdad en globals.css', () => {
    // La gemela de la anterior. Sin ella, renombrar un token dejaría `revisarTokens()`
    // comprobando una lista vacía y la prueba seguiría verde sin mirar nada.
    const tokens = leerTokens();
    for (const par of PARES) {
      expect(tokens.has(par.texto), `falta el token --${par.texto}`).toBe(true);
      expect(tokens.has(par.fondo), `falta el token --${par.fondo}`).toBe(true);
    }
  });

  it('se están comprobando las superficies de verdad, no solo el fondo de página', () => {
    // Un catálogo que solo mirase `--background` daría verde y no protegería la tarjeta,
    // que es donde vive casi toda la interfaz.
    const superficies = new Set(PARES.map((p) => p.fondo));
    expect(superficies).toContain('background');
    expect(superficies).toContain('card');
    expect(superficies).toContain('muted');
    expect(superficies.size).toBeGreaterThanOrEqual(4);
  });

  it('DEMOSTRACIÓN: bajar un token por debajo de AA pone la prueba en rojo', () => {
    // Es el criterio 5 del corte, y se demuestra rompiéndolo de verdad en vez de
    // afirmando que se detectaría. Se altera el CSS EN MEMORIA —no el fichero— y se
    // comprueba que `revisarTokens()` lo caza.
    const cssRoto = `
:root {
  --background: oklch(0.975 0.012 88);
  --foreground: oklch(0.93 0.035 165);
  --card: oklch(0.995 0.006 88);
  --card-foreground: oklch(0.25 0.035 165);
  --primary: oklch(0.38 0.09 163);
  --primary-foreground: oklch(0.98 0.01 88);
  --secondary: oklch(0.88 0.06 315);
  --secondary-foreground: oklch(0.32 0.07 315);
  --muted: oklch(0.94 0.018 88);
  --muted-foreground: oklch(0.52 0.035 165);
  --accent: oklch(0.77 0.14 78);
  --accent-foreground: oklch(0.28 0.06 65);
  --destructive: oklch(0.51 0.17 27);
  --destructive-foreground: oklch(0.98 0.01 88);
  --border: oklch(0.88 0.025 165);
  --input: oklch(0.88 0.025 165);
  --ring: oklch(0.55 0.1 163);
  --densidad-1: oklch(0.95 0.03 163);
  --densidad-2: oklch(0.89 0.05 163);
  --densidad-3: oklch(0.82 0.07 163);
  --densidad-4: oklch(0.75 0.08 163);
}
`;
    const fallos = revisarTokens(leerTokens(cssRoto));

    expect(fallos.length).toBeGreaterThan(0);
    expect(fallos.some((f) => f.par.texto === 'foreground')).toBe(true);
    // Y el mensaje dice DÓNDE se ve, no solo que falla.
    expect(describir(fallos)).toMatch(/fondo de página|tarjeta/);
  });

  it('la escala de densidad de la agenda anual se comprueba: texto a 4,5 y barra a 3,0 (T-047)', () => {
    for (const n of [1, 2, 3, 4]) {
      const fondo = `densidad-${n}`;
      const texto = PARES.find((p) => p.texto === 'foreground' && p.fondo === fondo);
      const barra = PARES.find((p) => p.texto === 'primary' && p.fondo === fondo);
      expect(texto, `falta foreground sobre ${fondo}`).toBeDefined();
      expect(texto?.grafico).toBeFalsy();
      expect(barra, `falta primary sobre ${fondo}`).toBeDefined();
      expect(barra?.grafico).toBe(true);
    }
    expect(UMBRAL_GRAFICO).toBe(3);
  });

  it('DEMOSTRACIÓN: un tono de densidad sin contraste con el texto y con la barra se caza, la barra con 3,0', () => {
    const css = `
:root {
  --background: oklch(0.975 0.012 88);
  --foreground: oklch(0.25 0.035 165);
  --card: oklch(0.995 0.006 88);
  --card-foreground: oklch(0.25 0.035 165);
  --primary: oklch(0.38 0.09 163);
  --primary-foreground: oklch(0.98 0.01 88);
  --secondary: oklch(0.88 0.06 315);
  --secondary-foreground: oklch(0.32 0.07 315);
  --muted: oklch(0.94 0.018 88);
  --muted-foreground: oklch(0.52 0.035 165);
  --accent: oklch(0.77 0.14 78);
  --accent-foreground: oklch(0.28 0.06 65);
  --destructive: oklch(0.51 0.17 27);
  --destructive-foreground: oklch(0.98 0.01 88);
  --border: oklch(0.88 0.025 165);
  --input: oklch(0.88 0.025 165);
  --ring: oklch(0.55 0.1 163);
  --densidad-1: oklch(0.95 0.03 163);
  --densidad-2: oklch(0.89 0.05 163);
  --densidad-3: oklch(0.82 0.07 163);
  --densidad-4: oklch(0.38 0.09 163);
}
`;
    const fallos = revisarTokens(leerTokens(css)).filter((f) => f.par.fondo === 'densidad-4');
    expect(fallos.map((f) => `${f.par.texto}:${f.umbral}`).sort()).toEqual(['foreground:4.5', 'primary:3']);
  });
});
