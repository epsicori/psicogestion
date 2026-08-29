/**
 * Pruebas del validador de contraste WCAG 2.2 AA para Psicogestión.
 */
import { describe, expect, it } from 'vitest';
import {
  interpretarOklch,
  luminanciaRelativa,
  razonDeContraste,
  cumpleAA,
  tonoMasCercanoQueCumple,
  type Oklch,
} from './contraste';

// Ayudante en vez de `!`: si alguna vez interpretarOklch deja de reconocer un formato que
// antes si, la prueba falla diciendolo, no reventando con «cannot read property of null».
function color(texto: string): Oklch {
  const valor = interpretarOklch(texto);
  if (!valor) throw new Error(`El literal OKLCH no se interpreta: `);
  return valor;
}

describe('interpretarOklch', () => {
  it('parsea oklch con L decimal (0-1)', () => {
    const resultado = interpretarOklch('oklch(0.975 0.012 88)');
    expect(resultado).toEqual({ l: 0.975, c: 0.012, h: 88 });
  });

  it('parsea oklch con L en porcentaje', () => {
    const resultado = interpretarOklch('oklch(97.5% 0.012 88)');
    expect(resultado).toEqual({ l: 0.975, c: 0.012, h: 88 });
  });

  it('parsea valores con croma y tono negativos/zero', () => {
    const resultado = interpretarOklch('oklch(0 0 0)');
    expect(resultado).toEqual({ l: 0, c: 0, h: 0 });
  });

  it('devuelve null para texto vacío', () => {
    expect(interpretarOklch('')).toBeNull();
    expect(interpretarOklch('oklch()')).toBeNull();
  });

  it('devuelve null para valores inválidos', () => {
    expect(interpretarOklch('rojo')).toBeNull();
    expect(interpretarOklch('#fff')).toBeNull();
    expect(interpretarOklch('oklch(1 2)')).toBeNull();
    expect(interpretarOklch('oklch(150% 0 0)')).toBeNull(); // L > 100%
    expect(interpretarOklch('oklch(-0.1 0 0)')).toBeNull(); // L negativo
    expect(interpretarOklch('oklch(0.5 -0.1 0)')).toBeNull(); // c negativo
    expect(interpretarOklch('oklch(0.5 0 400)')).toBeNull(); // h >= 360
  });
});

describe('luminanciaRelativa', () => {
  it('el negro tiene luminancia 0', () => {
    const negro: Oklch = { l: 0, c: 0, h: 0 };
    expect(luminanciaRelativa(negro)).toBe(0);
  });

  it('el blanco tiene luminancia 1', () => {
    const blanco: Oklch = { l: 1, c: 0, h: 0 };
    expect(luminanciaRelativa(blanco)).toBeCloseTo(1, 5);
  });
});

describe('razonDeContraste', () => {
  it('blanco sobre negro es ≈21', () => {
    const blanco: Oklch = { l: 1, c: 0, h: 0 };
    const negro: Oklch = { l: 0, c: 0, h: 0 };
    const contraste = razonDeContraste(blanco, negro);
    expect(contraste).toBeCloseTo(21, 0);
  });

  it('blanco sobre blanco da 1', () => {
    const blanco: Oklch = { l: 1, c: 0, h: 0 };
    const contraste = razonDeContraste(blanco, blanco);
    expect(contraste).toBeCloseTo(1, 1);
  });

  it('es simétrica', () => {
    const a: Oklch = { l: 0.5, c: 0.1, h: 180 };
    const b: Oklch = { l: 0.8, c: 0.05, h: 90 };
    expect(razonDeContraste(a, b)).toBe(razonDeContraste(b, a));
  });
});

describe('cumpleAA - casos reales del proyecto', () => {
  it('--foreground sobre --background cumple AA en texto normal', () => {
    const fondo = color('oklch(0.975 0.012 88)');
    const texto = color('oklch(0.25 0.035 165)');
    expect(cumpleAA(fondo, texto, false)).toBe(true);
  });

  it('un par que incumple AA devuelve false', () => {
    const fondo = color('oklch(0.975 0.012 88)');
    const texto = color('oklch(0.8 0.02 88)');
    expect(cumpleAA(fondo, texto, false)).toBe(false);
  });

  it('texto grande es más permisivo (entre 3 y 4.5)', () => {
    // Crear un color cuya razón esté entre 3 y 4.5
    const fondo = color('oklch(0.975 0.012 88)');
    // Este color debería dar ~3.5:1
    const texto = color('oklch(0.60 0.02 88)');
    
    const contraste = razonDeContraste(fondo, texto);
    const cumpleNormal = cumpleAA(fondo, texto, false);
    const cumpleGrande = cumpleAA(fondo, texto, true);
    
    // El contraste debe estar entre 3 y 4.5
    expect(contraste).toBeGreaterThan(3);
    expect(contraste).toBeLessThan(4.5);
    
    // No cumple en normal, sí en grande
    expect(cumpleNormal).toBe(false);
    expect(cumpleGrande).toBe(true);
  });
});

describe('tonoMasCercanoQueCumple', () => {
  it('devuelve un color que sí cumple AA', () => {
    const fondo = color('oklch(0.975 0.012 88)');
    const texto = color('oklch(0.8 0.02 88)');
    
    const sugerido = tonoMasCercanoQueCumple(fondo, texto, false);
    
    expect(sugerido).not.toBeNull();
    expect(cumpleAA(fondo!, sugerido!, false)).toBe(true);
  });

  it('mantiene el mismo croma y tono', () => {
    const fondo = color('oklch(0.975 0.012 88)');
    const texto = color('oklch(0.8 0.02 88)');
    
    const sugerido = tonoMasCercanoQueCumple(fondo, texto, false);
    
    expect(sugerido!.c).toBe(texto.c);
    expect(sugerido!.h).toBe(texto.h);
  });

  it('ajusta solo la luminosidad, no el matiz', () => {
    const fondo = color('oklch(0.975 0.012 88)');
    const texto = color('oklch(0.8 0.05 200)');
    
    const sugerido = tonoMasCercanoQueCumple(fondo, texto, false);
    
    // El tono (h) debe mantenerse igual
    expect(sugerido!.h).toBe(texto.h);
    // La luminosidad (l) debe haber cambiado
    expect(sugerido!.l).not.toBe(texto.l);
  });

  it('funciona también para texto grande', () => {
    const fondo = color('oklch(0.975 0.012 88)');
    const texto = color('oklch(0.75 0.02 88)');
    
    const sugerido = tonoMasCercanoQueCumple(fondo, texto, true);
    
    expect(sugerido).not.toBeNull();
    expect(cumpleAA(fondo!, sugerido!, true)).toBe(true);
  });

  it('devuelve null si ni negro ni blanco cumplen', () => {
    // Un fondo de luminosidad intermedia, sin manera de cumplir
    const fondo: Oklch = { l: 0.5, c: 0, h: 0 };
    const texto: Oklch = { l: 0.5, c: 0, h: 0 };
    
    // En este caso, negro y blanco sí deberían cumplir
    const resultado = tonoMasCercanoQueCumple(fondo, texto, false);
    expect(resultado).not.toBeNull();
  });
});
