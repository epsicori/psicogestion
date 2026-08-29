import { describe, expect, it } from 'vitest';

import { normalizarIban, validarIban } from './iban';

// Vectores de ejemplo de la norma (ECBS / registro SWIFT), verificados con un
// cálculo del módulo 97 independiente (BigInt) antes de escribir esta prueba:
//  · ES91 2100 0418 4502 0005 1332 → mod 97 = 1
//  · GB29 NWBK 6016 1331 9268 19  → mod 97 = 1
//  · FR1420041010050500013M02606 y DE89370400440532013000 → mod 97 = 1
//  · El mismo ES con el último dígito cambiado (…333) → mod 97 = 28, no valida.

// Tipado como unknown a propósito: son entradas que no deberían llegar nunca.
const CASOS_INVALIDOS: Array<[unknown, string]> = [
  ['ES9121000418450200051333', 'un dígito cambiado'],
  ['ES91210004184502000513329999999999', 'IBAN de 34 caracteres'],
  ['ES912100041845020005133', '23 caracteres: ES exige 24'],
  ['XX00000000000000000', 'país inexistente'],
  ['', 'cadena vacía'],
  [null, 'null colado como unknown'],
];

describe('validarIban', () => {
  it.each([
    'ES91 2100 0418 4502 0005 1332',
    'ES9121000418450200051332',
    'es91 2100 0418 4502 0005 1332',
    'GB29 NWBK 6016 1331 9268 19',
    'FR1420041010050500013M02606',
    'DE89370400440532013000',
  ])('acepta %j', (iban) => {
    expect(validarIban(iban)).toBe(true);
  });

  it.each(CASOS_INVALIDOS)('rechaza %j (%s)', (iban) => {
    expect(validarIban(iban as string)).toBe(false);
  });
});

describe('normalizarIban', () => {
  it('devuelve mayúsculas sin espacios', () => {
    expect(normalizarIban('es91 2100 0418 4502 0005 1332')).toBe(
      'ES9121000418450200051332',
    );
  });
});
