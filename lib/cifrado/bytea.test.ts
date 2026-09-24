import { describe, expect, it } from 'vitest';

import { aBase64, desdeBytea } from './bytea';

describe('desdeBytea', () => {
  it('decodifica la forma confirmada de PostgREST (\\x seguido de hex)', () => {
    // "hola" en hex es 686f6c61
    const resultado = desdeBytea('\\x686f6c61');
    expect(resultado?.toString('utf8')).toBe('hola');
  });

  it('null da null', () => {
    expect(desdeBytea(null)).toBeNull();
  });

  it('lanza con un mensaje propio si no llega la forma \\x', () => {
    expect(() => desdeBytea('686f6c61')).toThrow(/bytea/);
    expect(() => desdeBytea('base64:aG9sYQ==')).toThrow(/bytea/);
  });
});

describe('aBase64', () => {
  it('convierte un Buffer a base64', () => {
    expect(aBase64(Buffer.from('hola', 'utf8'))).toBe(Buffer.from('hola').toString('base64'));
  });
});

describe('ida y vuelta', () => {
  it('aBase64 y desdeBytea son inversas salvo el formato de transporte', () => {
    const original = Buffer.from([1, 2, 3, 250, 251, 252]);
    const hex = '\\x' + original.toString('hex');
    expect(desdeBytea(hex)?.equals(original)).toBe(true);
  });
});
