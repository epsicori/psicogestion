import { describe, expect, it } from 'vitest';

import { validarCif } from './cif';

// Vector anclado a cálculo a mano: A58818501.
// Dígitos 5 8 8 1 8 5 0; impares duplicados: 5→10→1, 8→16→7, 8→16→7, 0→0 (suman 15);
// pares: 8+1+5 = 14; total 29; (10 − 29 mod 10) mod 10 = 1. A exige dígito → control «1».
// Con la misma cuenta, los dígitos 1234567 dan total 26 → control 4 → letra «D».

// Tipado como unknown a propósito: son entradas que no deberían llegar nunca.
const CASOS_INVALIDOS: Array<[unknown, string]> = [
  ['A58818502', 'control equivocado por uno'],
  ['A1234567D', 'A exige dígito, no letra'],
  ['P12345674', 'P exige letra, no dígito'],
  ['H123456', 'demasiado corto'],
  ['', 'cadena vacía'],
  [null, 'null colado como unknown'],
];

describe('validarCif', () => {
  it.each([
    'A58818501',
    'a-58.818.501',
    'P1234567D', // P exige letra
    'C12345674', // C admite dígito
    'C1234567D', // …y también letra
    'A12345674',
  ])('acepta %j', (cif) => {
    expect(validarCif(cif)).toBe(true);
  });

  it.each(CASOS_INVALIDOS)('rechaza %j (%s)', (cif) => {
    expect(validarCif(cif as string)).toBe(false);
  });
});
