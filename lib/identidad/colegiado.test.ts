import { describe, expect, it } from 'vitest';

import { sanearColegiado, validarColegiado } from './colegiado';

describe('sanearColegiado', () => {
  it('recorta los extremos y colapsa los espacios interiores', () => {
    expect(sanearColegiado('  M-1234  ')).toBe('M-1234');
    expect(sanearColegiado('12   34\t56')).toBe('12 34 56');
  });
});

// Tipado como unknown a propósito: son entradas que no deberían llegar nunca.
const CASOS_INVALIDOS: Array<[unknown, string]> = [
  ['', 'cadena vacía'],
  ['   ', 'solo espacios'],
  ['\t \n', 'solo blancos'],
  ['x'.repeat(51), 'se pasa de la longitud razonable'],
  ['NUM-'.repeat(20), 'ochenta caracteres'],
  [null, 'null colado como unknown'],
];

describe('validarColegiado', () => {
  it.each([
    'M-1234',
    '12345',
    'A 1234 B',
    'COP-2024-00123',
    '  M-1  ',
    'x'.repeat(50),
  ])('acepta %j', (colegiado) => {
    expect(validarColegiado(colegiado)).toBe(true);
  });

  it.each(CASOS_INVALIDOS)('rechaza %j (%s)', (colegiado) => {
    expect(validarColegiado(colegiado as string)).toBe(false);
  });
});
