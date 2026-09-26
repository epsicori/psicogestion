import { describe, expect, it } from 'vitest';

import { diasDelMes, lunesDeLaSemana } from './mes';

describe('lunesDeLaSemana', () => {
  it('devuelve el mismo día si ya es lunes', () => {
    expect(lunesDeLaSemana('2027-02-01')).toBe('2027-02-01');
  });

  it('retrocede hasta el lunes, también desde el domingo', () => {
    expect(lunesDeLaSemana('2026-09-26')).toBe('2026-09-21');
    expect(lunesDeLaSemana('2026-09-27')).toBe('2026-09-21');
  });

  it('cruza el cambio de año', () => {
    expect(lunesDeLaSemana('2027-01-01')).toBe('2026-12-28');
  });

  it('lanza con una fecha inválida', () => {
    expect(() => lunesDeLaSemana('2026-02-30')).toThrow();
  });
});

describe('diasDelMes', () => {
  it('siempre da 42 días consecutivos empezando en lunes', () => {
    for (const fecha of ['2026-09-15', '2027-02-10', '2026-02-01', '2026-03-31', '2026-12-25']) {
      const dias = diasDelMes(fecha);
      expect(dias).toHaveLength(42);
      expect(lunesDeLaSemana(dias[0].fecha)).toBe(dias[0].fecha);
    }
  });

  it('febrero de 2027 empieza en lunes: la primera fila es del mes y la sexta del vecino', () => {
    const dias = diasDelMes('2027-02-17');
    expect(dias[0]).toEqual({ fecha: '2027-02-01', delMes: true });
    expect(dias.slice(0, 7).every((d) => d.delMes)).toBe(true);
    expect(dias[27]).toEqual({ fecha: '2027-02-28', delMes: true });
    expect(dias[28]).toEqual({ fecha: '2027-03-01', delMes: false });
    expect(dias.slice(35).every((d) => !d.delMes)).toBe(true);
    expect(dias[41].fecha).toBe('2027-03-14');
  });

  it('septiembre de 2026 (30 días) arranca en el lunes 31 de agosto', () => {
    const dias = diasDelMes('2026-09-01');
    expect(dias[0]).toEqual({ fecha: '2026-08-31', delMes: false });
    expect(dias[1]).toEqual({ fecha: '2026-09-01', delMes: true });
    expect(dias.filter((d) => d.delMes)).toHaveLength(30);
    expect(dias[41].fecha).toBe('2026-10-11');
  });

  it('un mes de 31 días que empieza en domingo ocupa las seis filas', () => {
    // Marzo de 2026 empieza en domingo.
    const dias = diasDelMes('2026-03-10');
    expect(dias[0]).toEqual({ fecha: '2026-02-23', delMes: false });
    expect(dias[6]).toEqual({ fecha: '2026-03-01', delMes: true });
    expect(dias.filter((d) => d.delMes)).toHaveLength(31);
    expect(dias[36]).toEqual({ fecha: '2026-03-31', delMes: true });
  });

  it('cruza el cambio de año', () => {
    const dias = diasDelMes('2027-01-20');
    expect(dias[0].fecha).toBe('2026-12-28');
    expect(dias[0].delMes).toBe(false);
    expect(dias.filter((d) => d.delMes)).toHaveLength(31);
  });

  it('lanza con una fecha inválida', () => {
    expect(() => diasDelMes('2026-02-30')).toThrow();
  });
});
