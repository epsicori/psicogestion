import { describe, expect, it } from 'vitest';

import { pendiente, repartir } from './reparto';

describe('repartir', () => {
  it('30000 céntimos en 7 partes: el reparto entero, no solo la suma', () => {
    // 300,00 € / 7 = 42,857… → cinco partes de 42,86 € y dos de 42,85 €.
    // El resto se reparte un céntimo a cada una de las primeras.
    const partes = repartir(30000, 7);
    expect(partes).toEqual([4286, 4286, 4286, 4286, 4286, 4285, 4285]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(30000);
  });

  it('reparto exacto: ninguna parte se lleva céntimo de más', () => {
    expect(repartir(10000, 4)).toEqual([2500, 2500, 2500, 2500]);
  });

  it('una sola parte se lo queda todo', () => {
    expect(repartir(1234, 1)).toEqual([1234]);
  });

  it('el resto nunca alcanza a todas las partes: suma exacta en un caso feo', () => {
    // 100 céntimos en 3: 34 + 33 + 33. Ni sobra ni falta.
    const partes = repartir(100, 3);
    expect(partes).toEqual([34, 33, 33]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('con total negativo el resto también cuadra (devoluciones)', () => {
    const partes = repartir(-100, 3);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(-100);
  });

  it('rechaza un número de partes que no sea un entero mayor que cero', () => {
    expect(() => repartir(1000, 0)).toThrow(/partes/);
    expect(() => repartir(1000, 2.5)).toThrow(/partes/);
    expect(() => repartir(1000, -3)).toThrow(/partes/);
  });

  it('rechaza un total que no es entero: el dinero vive en céntimos', () => {
    expect(() => repartir(10.5, 2)).toThrow(/entero/);
  });
});

describe('pendiente', () => {
  it('a falta de cobro, devuelve lo que queda', () => {
    expect(pendiente(10000, 4000)).toEqual({
      estado: 'pendiente',
      pendiente: 6000,
      excedente: 0,
    });
  });

  it('cobrado del todo: pendiente cero y sin excedente', () => {
    expect(pendiente(10000, 10000)).toEqual({
      estado: 'cobrado',
      pendiente: 0,
      excedente: 0,
    });
  });

  it('cobrado de más NO es un pendiente negativo: es excedente, y se distingue de cobrado', () => {
    const resultado = pendiente(10000, 12000);
    expect(resultado.estado).toBe('cobrado_de_mas');
    expect(resultado.pendiente).toBe(0); // nunca negativo disfrazado
    expect(resultado.excedente).toBe(2000);
    expect(resultado.estado).not.toBe('cobrado');
  });

  it('sin cobrar nada, todo el total está pendiente', () => {
    expect(pendiente(5000, 0)).toEqual({
      estado: 'pendiente',
      pendiente: 5000,
      excedente: 0,
    });
  });

  it('rechaza un total o un cobrado que no sea entero: igual que repartir()', () => {
    expect(() => pendiente(10000, 4000.5)).toThrow(/entero/);
    expect(() => pendiente(10000.5, 4000)).toThrow(/entero/);
  });
});
