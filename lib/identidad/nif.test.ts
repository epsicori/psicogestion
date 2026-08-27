import { describe, expect, it } from 'vitest';

import { normalizarNif, validarNif } from './nif';

// Vectores anclados a cálculo a mano, no a la implementación:
//  · DNI 12345678: 23 × 536.768 = 12.345.664, resto 14 → TRWAGMYFPDXBNJZSQVHLCKE[14] = Z.
//  · NIE X2482300: X → 0 da 02482300; 23 × 107.926 = 2.482.298, resto 2 → tabla[2] = W.
// (Comprobados además con aritmética entera antes de escribir esta prueba.)

// Tipado como unknown a propósito: son entradas que no deberían llegar nunca.
const CASOS_INVALIDOS: Array<[unknown, string]> = [
  ['12345678Y', 'letra equivocada por una'],
  ['X2482300X', 'NIE con letra equivocada'],
  ['1234567Z', 'solo siete dígitos'],
  ['12345678', 'sin letra'],
  ['', 'cadena vacía'],
  [null, 'null colado como unknown'],
];

describe('validarNif', () => {
  it.each([
    '12345678Z',
    '12345678z',
    '12345678-Z',
    ' 12345678 Z ',
    'X2482300W',
    'Y2849113W',
  ])('acepta %j', (nif) => {
    expect(validarNif(nif)).toBe(true);
  });

  it.each(CASOS_INVALIDOS)('rechaza %j (%s)', (nif) => {
    expect(validarNif(nif as string)).toBe(false);
  });
});

describe('normalizarNif', () => {
  it('devuelve la misma cadena para todas las formas del mismo DNI', () => {
    const formas = ['12345678z', '12345678-Z', ' 12345678 Z ', '12345678Z'];
    const normalizadas = formas.map(normalizarNif);

    for (const normalizada of normalizadas) {
      expect(normalizada).toBe('12345678Z');
    }
  });
});
