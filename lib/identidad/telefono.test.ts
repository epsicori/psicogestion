import { describe, expect, it } from 'vitest';

import {
  formatearTelefono,
  normalizarTelefono,
  tipoTelefono,
  validarTelefono,
} from './telefono';

// Tipado como unknown a propósito: son entradas que no deberían llegar nunca.
const CASOS_INVALIDOS: Array<[unknown, string]> = [
  ['500000000', 'empieza por 5: ni móvil ni fijo'],
  ['+34 0034 600 000 000', 'prefijo doble'],
  ['60000000', 'ocho dígitos'],
  ['6000000000', 'diez dígitos'],
  ['', 'cadena vacía'],
  [null, 'null colado como unknown'],
];

describe('validarTelefono', () => {
  it.each([
    '600 00 00 00',
    '+34 600 000 000',
    '0034600000000',
    '910000000',
    '600-000-000',
    '711222333',
  ])('acepta %j', (telefono) => {
    expect(validarTelefono(telefono)).toBe(true);
  });

  it.each(CASOS_INVALIDOS)('rechaza %j (%s)', (telefono) => {
    expect(validarTelefono(telefono as string)).toBe(false);
  });
});

describe('tipoTelefono', () => {
  it('distingue móvil de fijo', () => {
    expect(tipoTelefono('600000000')).toBe('movil');
    expect(tipoTelefono('711222333')).toBe('movil');
    expect(tipoTelefono('910000000')).toBe('fijo');
    expect(tipoTelefono('821000000')).toBe('fijo');
    expect(tipoTelefono('500000000')).toBeNull();
  });
});

describe('normalizarTelefono', () => {
  it('devuelve la misma cadena E.164 para todas las formas del mismo número', () => {
    const formas = ['600 00 00 00', '+34 600 000 000', '0034600000000'];

    for (const forma of formas) {
      expect(normalizarTelefono(forma)).toBe('+34600000000');
    }
  });

  it('devuelve null si el teléfono no valida', () => {
    expect(normalizarTelefono('500000000')).toBeNull();
  });
});

describe('formatearTelefono', () => {
  it('devuelve la forma legible para pintar', () => {
    expect(formatearTelefono('+34600000000')).toBe('600 000 000');
  });
});
