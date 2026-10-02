import { describe, expect, it } from 'vitest';

import { SIN_NULO, esquemaBorrador, esquemaCuerpo } from './cuerpo';

describe('esquemaCuerpo', () => {
  it('acepta {texto} y nada más (la forma de la siembra y de los vectores)', () => {
    expect(esquemaCuerpo.safeParse({ texto: 'hola' }).success).toBe(true);
  });

  it('rechaza claves de más: el cuerpo sellado no lleva discriminante', () => {
    expect(esquemaCuerpo.safeParse({ texto: 'hola', formato: 'md' }).success).toBe(false);
  });

  it('rechaza un cuerpo sin texto', () => {
    expect(esquemaCuerpo.safeParse({}).success).toBe(false);
  });
});

describe('esquemaBorrador', () => {
  it('tolera el borrador sembrado, sin `reservadas`, y lo completa con cadena vacía', () => {
    expect(esquemaBorrador.parse({ texto: 'x' })).toEqual({ texto: 'x', reservadas: '' });
  });

  it('conserva las dos claves cuando llegan', () => {
    expect(esquemaBorrador.parse({ texto: 'x', reservadas: 'y' })).toEqual({
      texto: 'x',
      reservadas: 'y',
    });
  });

  it('rechaza un borrador que no es un objeto con texto', () => {
    expect(esquemaBorrador.safeParse(null).success).toBe(false);
    expect(esquemaBorrador.safeParse({ reservadas: 'y' }).success).toBe(false);
  });
});

describe('SIN_NULO', () => {
  it('rechaza U+0000 (la base lo rechazaría con 22P05) y acepta el resto', () => {
    expect(SIN_NULO.test('a\u0000b')).toBe(false);
    expect(SIN_NULO.test('ñandú\nlínea')).toBe(true);
  });
});
