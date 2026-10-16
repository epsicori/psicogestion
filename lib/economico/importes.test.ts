import { describe, expect, it } from 'vitest';

import { desglosarDesdeTotal } from '@/lib/dinero/iva';

import { calcularImportes, centimosDeNumeric, ErrorCuotaMinima } from './importes';
import type { LineaBorrador } from './tipos';

// T-046 · CA9: céntimos de punta a punta. La cuota sale de la SUMA general, desglosada una vez
// desde el total (precio con IVA), nunca línea a línea; Σ líneas = total y base = total − cuota.

function linea(precio: number, regimen: 'exento_sanitario' | 'general', cantidad = 1): LineaBorrador {
  return {
    concepto: 'Sesión',
    cantidad,
    precio_unitario_centimos: precio,
    regimen_iva: regimen,
    tipo_iva_centesimas: regimen === 'general' ? 2100 : 0,
    cita_id: null,
  };
}

describe('centimosDeNumeric', () => {
  it('lee el texto de un numeric(12,2) sin pasar por flotantes', () => {
    expect(centimosDeNumeric('60.00')).toBe(6000);
    expect(centimosDeNumeric('0.10')).toBe(10);
    expect(centimosDeNumeric('1234567.89')).toBe(123456789);
  });

  it('rechaza lo que no es exactamente dos decimales', () => {
    for (const malo of ['60', '60.0', '60,00', '-1.00', '1e3', '', ' 60.00', '60.000']) {
      expect(() => centimosDeNumeric(malo), malo).toThrow();
    }
  });
});

describe('calcularImportes', () => {
  it('todo exento: cuota 0 y base = total', () => {
    expect(calcularImportes([linea(6000, 'exento_sanitario'), linea(2500, 'exento_sanitario', 2)])).toEqual({
      base: 11000,
      cuota: 0,
      total: 11000,
    });
  });

  it('una general de 60,00 €: la cuota es la de desglosarDesdeTotal', () => {
    const d = desglosarDesdeTotal(6000, 'general');
    expect(calcularImportes([linea(6000, 'general')])).toEqual({ base: d.base, cuota: d.cuota, total: 6000 });
  });

  it('mezcla: la cuota sale solo de las generales, sumadas antes de desglosar', () => {
    const r = calcularImportes([linea(6000, 'exento_sanitario'), linea(12100, 'general')]);
    expect(r).toEqual({ base: 16000, cuota: 2100, total: 18100 });
  });

  it('la cuota se calcula sobre la suma, no línea a línea', () => {
    // Tres líneas de 0,07 €: cada una tiene cuota 1 (base 6), así que línea a línea serían 3;
    // sobre la suma, 0,21 € da base 17 y cuota 4.
    expect(desglosarDesdeTotal(7, 'general').cuota * 3).toBe(3);
    const r = calcularImportes([linea(7, 'general'), linea(7, 'general'), linea(7, 'general')]);
    expect(r.cuota).toBe(desglosarDesdeTotal(21, 'general').cuota);
    expect(r.base + r.cuota).toBe(r.total);
  });

  it('Σ cantidad × precio = total', () => {
    const r = calcularImportes([linea(2500, 'general', 3), linea(100, 'exento_sanitario', 7)]);
    expect(r.total).toBe(7500 + 700);
    expect(r.base + r.cuota).toBe(r.total);
  });

  it('1 o 2 céntimos generales: ErrorCuotaMinima (A4-H1)', () => {
    expect(() => calcularImportes([linea(1, 'general')])).toThrow(ErrorCuotaMinima);
    expect(() => calcularImportes([linea(2, 'general'), linea(5000, 'exento_sanitario')])).toThrow(ErrorCuotaMinima);
    expect(() => calcularImportes([linea(3, 'general')])).not.toThrow();
  });

  it('rechaza importes que no son céntimos enteros', () => {
    expect(() => calcularImportes([linea(60.5, 'exento_sanitario')])).toThrow();
  });
});
