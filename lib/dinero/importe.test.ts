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

  it("rechaza un primer grupo de millares que empieza por cero: '0.500' no son 500 €", () => {
    // Ninguna cifra española en millares empieza por cero: '0.500' no es un
    // millar, y leerlo como tal multiplicaría por mil lo tecleado.
    expect(() => aCentimos('0.500')).toThrow(/No es un importe/);
    expect(() => aCentimos('00.500')).toThrow(/No es un importe/);
    expect(() => aCentimos('0.123,00')).toThrow(/No es un importe/);
    // Gemelas positivas: el cero como parte entera y los millares bien formados siguen valiendo.
    expect(aCentimos('0.50')).toBe(50);
    expect(aCentimos('1.500')).toBe(150000);
    expect(aCentimos('100.000,00')).toBe(10000000);
  });

  it('un cero con signo menos es cero, no -0', () => {
    expect(Object.is(aCentimos('-0'), 0)).toBe(true);
    expect(Object.is(aCentimos('-0,00'), 0)).toBe(true);
    expect(aCentimos('-0,01')).toBe(-1);
  });

  it('rechaza una cifra que no cabe exacta en céntimos en vez de devolver otra', () => {
    expect(() => aCentimos('99999999999999999')).toThrow(/No es un importe/);
    // 90.071.992.547.409,91 € es el mayor importe exacto (Number.MAX_SAFE_INTEGER céntimos).
    expect(aCentimos('90071992547409,91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => aCentimos('90071992547409,92')).toThrow(/No es un importe/);
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

  it('rechaza céntimos no enteros, igual que repartir(): el dinero vive en céntimos', () => {
    expect(() => formatearImporte(4000.5)).toThrow(/entero/);
    expect(() => formatearImporte(Number.NaN)).toThrow(/entero/);
  });

  it('un -0 se pinta como cero, sin signo', () => {
    expect(normal(formatearImporte(-0))).toBe('0,00 €');
  });
});

describe('redondearCentimos', () => {
  it('media lejos del cero: medio céntimo sube, y por debajo baja', () => {
    // La regla escrita una vez: 0,5 céntimo SUBE (al alza)...
    expect(redondearCentimos(10.5)).toBe(11);
    // ...y todo lo que no llega a la mitad BAJA. Las dos direcciones.
    expect(redondearCentimos(10.49)).toBe(10);
  });

  it('media lejos del cero con negativos: -10,5 va a -11, el opuesto exacto de 10,5', () => {
    // La regla es simétrica: una devolución redondea igual que su cargo, con el
    // signo cambiado. Math.round llevaría -10,5 a -10 y dejaría un céntimo.
    expect(redondearCentimos(-10.5)).toBe(-11);
    expect(redondearCentimos(-10.49)).toBe(-10);
    expect(redondearCentimos(-10.51)).toBe(-11);
  });

  it('nunca devuelve -0', () => {
    expect(Object.is(redondearCentimos(-0.3), 0)).toBe(true);
    expect(Object.is(redondearCentimos(-0), 0)).toBe(true);
  });
});
