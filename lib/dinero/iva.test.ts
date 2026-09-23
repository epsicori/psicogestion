import { describe, expect, it } from 'vitest';

import { desglosarDesdeBase, desglosarDesdeTotal } from './iva';

describe('desglosarDesdeBase', () => {
  it('régimen general: cuota del 21 % redondeada una vez, total = base + cuota', () => {
    // 100,00 € de base: 21,00 € de cuota, 121,00 € de total.
    expect(desglosarDesdeBase(10000, 'general')).toEqual({
      regimen: 'general',
      base: 10000,
      cuota: 2100,
      total: 12100,
      tipoImpositivo: 21,
    });
  });

  it('exento_sanitario: cuota CERO y tipoImpositivo NULO — no hay impuesto, no es «21 % de cero»', () => {
    const exento = desglosarDesdeBase(5000, 'exento_sanitario');
    expect(exento).toEqual({
      regimen: 'exento_sanitario',
      base: 5000,
      cuota: 0,
      total: 5000,
      tipoImpositivo: null,
    });
    // La distinción que el desglose tiene que poder hacer: un general con
    // base cero también da cuota cero, pero su tipo es 21 y el exento es null.
    const ceroAl21 = desglosarDesdeBase(0, 'general');
    expect(ceroAl21.cuota).toBe(0);
    expect(ceroAl21.tipoImpositivo).toBe(21);
    expect(exento.tipoImpositivo).toBeNull();
  });

  it('caso en el filo del redondeo, en las dos direcciones (media al alza)', () => {
    // Base 0,50 € → 21 % = 10,5 céntimos: medio céntimo exacto, SUBE a 11.
    expect(desglosarDesdeBase(50, 'general').cuota).toBe(11);
    // Base 0,45 € → 21 % = 9,45 céntimos: no llega a la mitad, BAJA a 9.
    expect(desglosarDesdeBase(45, 'general').cuota).toBe(9);
  });

  it('un régimen desconocido lanza, no cae al 21 % general por defecto', () => {
    // Dato corrupto o typo que TypeScript no pilla (viene de fetch/JSON):
    // rechazar es obligatorio, facturar en silencio al general no lo es.
    expect(() => desglosarDesdeBase(10000, '' as unknown as 'general')).toThrow(
      /Régimen de IVA desconocido/,
    );
    expect(() => desglosarDesdeBase(10000, 'General' as unknown as 'general')).toThrow(
      /Régimen de IVA desconocido/,
    );
  });
});

describe('desglosarDesdeTotal', () => {
  it('el precio tecleado es CON IVA: 121,00 € al 21 % son 100,00 € de base y 21,00 € de cuota', () => {
    expect(desglosarDesdeTotal(12100, 'general')).toEqual({
      regimen: 'general',
      base: 10000,
      cuota: 2100,
      total: 12100,
      tipoImpositivo: 21,
    });
  });

  it('base + cuota = total EXACTO también cuando la base no es redonda', () => {
    // 100,00 € con IVA incluido: base 82,64 € (8264,46… redondea a 8264) y la
    // cuota es la diferencia, así que la suma cierra siempre.
    const d = desglosarDesdeTotal(10000, 'general');
    expect(d.base).toBe(8264);
    expect(d.cuota).toBe(1736);
    expect(d.base + d.cuota).toBe(10000);
  });

  it('exento_sanitario desde total: total = base, cuota cero, tipo nulo', () => {
    expect(desglosarDesdeTotal(6000, 'exento_sanitario')).toEqual({
      regimen: 'exento_sanitario',
      base: 6000,
      cuota: 0,
      total: 6000,
      tipoImpositivo: null,
    });
  });

  it('ida y vuelta por caminos distintos no pierde el céntimo en importes redondos', () => {
    // Desde base 100,00 € → total 121,00 € → desde total vuelve a la misma base.
    const ida = desglosarDesdeBase(10000, 'general');
    const vuelta = desglosarDesdeTotal(ida.total, 'general');
    expect(vuelta.base).toBe(ida.base);
    expect(vuelta.cuota).toBe(ida.cuota);
  });

  it('un régimen desconocido lanza también desde el total', () => {
    expect(() => desglosarDesdeTotal(10000, 'General' as unknown as 'general')).toThrow(
      /Régimen de IVA desconocido/,
    );
  });
});
