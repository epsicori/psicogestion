import { describe, expect, it } from 'vitest';

import { aCentimos, formatearImporte, redondearCentimos } from './importe';

describe('aCentimos', () => {
  it('acepta lo que un humano teclea, y da lo mismo en todas sus grafías', () => {
    expect(aCentimos('12,50')).toBe(1250);
    expect(aCentimos('12.50')).toBe(1250);
    expect(aCentimos('12')).toBe(1200);
    expect(aCentimos(' 12,50 € ')).toBe(1250);
  });

  it('lee millares a la española: punto de millares con coma decimal', () => {
    expect(aCentimos('1.234,56')).toBe(123456);
    // Sin coma, un punto con grupo de tres es millares, no decimales.
    expect(aCentimos('1.234')).toBe(123400);
  });

  it('admite un decimal suelto y el cero', () => {
    expect(aCentimos('0,5')).toBe(50);
    expect(aCentimos('0')).toBe(0);
    expect(aCentimos('7,5')).toBe(750);
  });

  it('admite signo menos (una devolución)', () => {
    expect(aCentimos('-5,00')).toBe(-500);
  });

  it('rechaza con excepción lo que no es un importe: nada de NaN en silencio', () => {
    expect(() => aCentimos('doce')).toThrow(/No es un importe/);
    expect(() => aCentimos('')).toThrow(/No es un importe/);
    expect(() => aCentimos('12,5,0')).toThrow(/No es un importe/);
    expect(() => aCentimos('€')).toThrow(/No es un importe/);
  });

  it('rechaza millares mal agrupados junto a coma decimal: no es un céntimo silencioso, es un importe distinto', () => {
    // '1.23,50' no es '1.234,50' con un dígito de menos: el grupo tras el
    // punto no tiene tres dígitos, así que no es un millar, es un error.
    expect(() => aCentimos('1.23,50')).toThrow(/No es un importe/);
    expect(() => aCentimos('12.3456,00')).toThrow(/No es un importe/);
    expect(() => aCentimos('.123,00')).toThrow(/No es un importe/);
  });

  it('sigue aceptando los millares bien formados junto a coma decimal', () => {
    expect(aCentimos('1.234,50')).toBe(123450);
    expect(aCentimos('123,50')).toBe(12350);
    expect(aCentimos('1234,50')).toBe(123450);
  });
});

describe('formatearImporte', () => {
  // El espacio de Intl entre la cifra y el € es un espacio duro (U+00A0); se
  // normaliza para que la aserción se lea como se escribe.
  const normal = (s: string) => s.replace(/\s/g, ' ');

  it('formatea a la española: coma decimal, punto de millares, € detrás', () => {
    expect(normal(formatearImporte(1250))).toBe('12,50 €');
    // Intl es-ES no separa millares en cifras de 4 dígitos (convención
    // española: el punto de millares aparece a partir de 10.000).
    expect(normal(formatearImporte(123456))).toBe('1234,56 €');
    expect(normal(formatearImporte(123456789))).toBe('1.234.567,89 €');
    expect(normal(formatearImporte(0))).toBe('0,00 €');
    expect(normal(formatearImporte(-500))).toBe('-5,00 €');
  });

  it('es la vuelta exacta de aCentimos: lo tecleado sale igual que entró', () => {
    expect(normal(formatearImporte(aCentimos('12,50')))).toBe('12,50 €');
    expect(normal(formatearImporte(aCentimos('1.234.567,89')))).toBe('1.234.567,89 €');
  });
});

describe('redondearCentimos', () => {
  it('media al alza: medio céntimo sube, y por debajo baja', () => {
    // La regla escrita una vez: 0,5 céntimo SUBE (al alza)...
    expect(redondearCentimos(10.5)).toBe(11);
    // ...y todo lo que no llega a la mitad BAJA. Las dos direcciones.
    expect(redondearCentimos(10.49)).toBe(10);
  });
});
