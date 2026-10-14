import { describe, expect, it } from 'vitest';

import { UMBRAL_DIAS, UMBRAL_SESIONES, leerBono } from './estado';

const HOY = '2026-10-14';
const bono = (totales: number, consumidas: number, caducidad: string | null = null) => ({
  sesionesTotales: totales,
  sesionesConsumidas: consumidas,
  caducidad,
});

describe('leerBono · estado derivado, nunca almacenado', () => {
  it('umbrales declarados', () => {
    expect(UMBRAL_SESIONES).toBe(2);
    expect(UMBRAL_DIAS).toBe(30);
  });

  it('un bono de 5 con 3 consumidas: vigente, saldo 2', () => {
    expect(leerBono(bono(5, 3), HOY)).toMatchObject({ estado: 'vigente', saldo: 2, excedidas: 0 });
  });

  it('saldo 0: agotado', () => {
    expect(leerBono(bono(5, 5), HOY)).toMatchObject({ estado: 'agotado', saldo: 0, aviso: null });
  });

  it('caducidad ayer con saldo 2: caducado', () => {
    expect(leerBono(bono(5, 3, '2026-10-13'), HOY)).toMatchObject({ estado: 'caducado', saldo: 2, aviso: null });
  });

  it('caducidad hoy: aún vigente (el día de la caducidad vale)', () => {
    expect(leerBono(bono(5, 0, HOY), HOY).estado).toBe('vigente');
  });

  it('agotado y caducado a la vez: agotado', () => {
    expect(leerBono(bono(5, 5, '2026-01-01'), HOY).estado).toBe('agotado');
  });

  it('consumidas 6 de 5: agotado, saldo 0, excedidas 1', () => {
    expect(leerBono(bono(5, 6), HOY)).toEqual({ estado: 'agotado', saldo: 0, excedidas: 1, aviso: null });
  });

  it('aviso por pocas sesiones: sí con saldo 2 y 1, no con 3', () => {
    expect(leerBono(bono(5, 3), HOY).aviso).toBe('pocas');
    expect(leerBono(bono(5, 2), HOY).aviso).toBeNull();
    expect(leerBono(bono(5, 4), HOY).aviso).toBe('pocas');
  });

  it('aviso por caducidad: sí a 30 días, no a 31', () => {
    expect(leerBono(bono(10, 0, '2026-11-13'), HOY).aviso).toBe('caduca');
    expect(leerBono(bono(10, 0, '2026-11-14'), HOY).aviso).toBeNull();
  });

  it('pocas sesiones prevalece sobre caducidad próxima', () => {
    expect(leerBono(bono(5, 4, '2026-10-20'), HOY).aviso).toBe('pocas');
  });

  it('sin caducidad y con saldo de sobra: sin aviso', () => {
    expect(leerBono(bono(10, 0), HOY)).toEqual({ estado: 'vigente', saldo: 10, excedidas: 0, aviso: null });
  });
});
