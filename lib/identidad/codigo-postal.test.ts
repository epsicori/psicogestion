import { describe, expect, it } from 'vitest';

import { provinciaDeCodigoPostal, validarCodigoPostal } from './codigo-postal';

// Tipado como unknown a propósito: son entradas que no deberían llegar nunca.
const CASOS_INVALIDOS: Array<[unknown, string]> = [
  ['53001', 'provincia 53 no existe: el máximo es 52'],
  ['00001', 'provincia 00 no existe: el mínimo es 01'],
  ['1234', 'cuatro dígitos'],
  ['280013', 'seis dígitos'],
  ['', 'cadena vacía'],
  [null, 'null colado como unknown'],
];

describe('validarCodigoPostal', () => {
  it.each(['01001', '02002', '08001', '28080', '46980', '52999'])('acepta %j', (cp) => {
    expect(validarCodigoPostal(cp)).toBe(true);
  });

  it.each(CASOS_INVALIDOS)('rechaza %j (%s)', (cp) => {
    expect(validarCodigoPostal(cp as string)).toBe(false);
  });

  it('no acepta un número: los ceros a la izquierda solo sobreviven en texto', () => {
    expect(validarCodigoPostal(1001 as unknown as string)).toBe(false);
  });
});

describe('provinciaDeCodigoPostal', () => {
  it('conserva el cero inicial y devuelve el código de provincia', () => {
    expect(provinciaDeCodigoPostal('01001')).toBe('01');
  });

  it('devuelve null si el código no valida', () => {
    expect(provinciaDeCodigoPostal('53001')).toBeNull();
  });
});
