import { describe, expect, it } from 'vitest';

import { destinoEnAnio, mesesDelAnio, nivelDeDensidad, tramosDeDensidad } from './anio';

describe('mesesDelAnio', () => {
  it('2026: doce meses, 365 días únicos y ordenados, enero con tres huecos', () => {
    const meses = mesesDelAnio(2026);
    expect(meses).toHaveLength(12);
    expect(meses.map((m) => m.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const dias = meses.flatMap((m) => m.dias);
    expect(dias).toHaveLength(365);
    expect(new Set(dias).size).toBe(365);
    expect([...dias].sort()).toEqual(dias);
    expect(dias[0]).toBe('2026-01-01');
    expect(dias[364]).toBe('2026-12-31');
    // El 1 de enero de 2026 es jueves: lunes, martes y miércoles quedan vacíos.
    expect(meses[0].huecos).toBe(3);
  });

  it('cada día queda dentro de su mes', () => {
    for (const m of mesesDelAnio(2026)) {
      const prefijo = `2026-${String(m.mes).padStart(2, '0')}-`;
      expect(m.dias.every((d) => d.startsWith(prefijo))).toBe(true);
    }
  });

  it('2028 es bisiesto: 366 días y el 29 de febrero', () => {
    const dias = mesesDelAnio(2028).flatMap((m) => m.dias);
    expect(dias).toHaveLength(366);
    expect(dias).toContain('2028-02-29');
  });

  it('los huecos van de 0 a 6 (lunes primero)', () => {
    for (const m of mesesDelAnio(2026)) {
      expect(m.huecos).toBeGreaterThanOrEqual(0);
      expect(m.huecos).toBeLessThanOrEqual(6);
    }
    // El 1 de junio de 2026 es lunes.
    expect(mesesDelAnio(2026)[5].huecos).toBe(0);
  });
});

describe('nivelDeDensidad', () => {
  it('0 y un máximo sin citas dan 0', () => {
    expect(nivelDeDensidad(0, 10)).toBe(0);
    expect(nivelDeDensidad(5, 0)).toBe(0);
    expect(nivelDeDensidad(-1, 10)).toBe(0);
  });

  it('el máximo siempre es el nivel 4', () => {
    for (const max of [1, 2, 3, 5, 14, 60]) expect(nivelDeDensidad(max, max)).toBe(4);
  });
});

describe('tramosDeDensidad', () => {
  it('año vacío: ningún tramo', () => {
    expect(tramosDeDensidad([])).toEqual([]);
    expect(tramosDeDensidad([0, 0, 0])).toEqual([]);
  });

  it('un solo día con una cita: un tramo 1–1 en el nivel 4', () => {
    expect(tramosDeDensidad([0, 1, 0])).toEqual([{ nivel: 4, desde: 1, hasta: 1 }]);
  });

  it('máximo 14: 1–3, 4–7, 8–10 y 11–14', () => {
    expect(tramosDeDensidad([0, 3, 14, 7])).toEqual([
      { nivel: 1, desde: 1, hasta: 3 },
      { nivel: 2, desde: 4, hasta: 7 },
      { nivel: 3, desde: 8, hasta: 10 },
      { nivel: 4, desde: 11, hasta: 14 },
    ]);
  });

  it('todos los días iguales (5): 1–1, 2–2, 3–3 y 4–5', () => {
    expect(tramosDeDensidad([5, 5, 5])).toEqual([
      { nivel: 1, desde: 1, hasta: 1 },
      { nivel: 2, desde: 2, hasta: 2 },
      { nivel: 3, desde: 3, hasta: 3 },
      { nivel: 4, desde: 4, hasta: 5 },
    ]);
  });

  it('invariante: para todo n de 1 a max, su nivel es el del único tramo que lo contiene', () => {
    for (let max = 1; max <= 60; max++) {
      const tramos = tramosDeDensidad([max]);
      for (let n = 1; n <= max; n++) {
        const que = tramos.filter((t) => n >= t.desde && n <= t.hasta);
        expect(que).toHaveLength(1);
        expect(nivelDeDensidad(n, max)).toBe(que[0].nivel);
      }
    }
  });
});

describe('destinoEnAnio', () => {
  const A = 2026;

  it('←/→ mueven un día cruzando semana y mes', () => {
    expect(destinoEnAnio('ArrowRight', '2026-03-10', A)).toBe('2026-03-11');
    expect(destinoEnAnio('ArrowLeft', '2026-03-10', A)).toBe('2026-03-09');
    expect(destinoEnAnio('ArrowRight', '2026-03-31', A)).toBe('2026-04-01');
    expect(destinoEnAnio('ArrowLeft', '2026-04-01', A)).toBe('2026-03-31');
  });

  it('↑/↓ mueven siete días cruzando mes', () => {
    expect(destinoEnAnio('ArrowDown', '2026-03-10', A)).toBe('2026-03-17');
    expect(destinoEnAnio('ArrowUp', '2026-03-10', A)).toBe('2026-03-03');
    expect(destinoEnAnio('ArrowDown', '2026-03-28', A)).toBe('2026-04-04');
    expect(destinoEnAnio('ArrowUp', '2026-04-03', A)).toBe('2026-03-27');
  });

  it('RePág/AvPág: un mes, recortando al último día', () => {
    expect(destinoEnAnio('PageDown', '2026-03-10', A)).toBe('2026-04-10');
    expect(destinoEnAnio('PageUp', '2026-03-10', A)).toBe('2026-02-10');
    expect(destinoEnAnio('PageUp', '2026-03-31', A)).toBe('2026-02-28');
    expect(destinoEnAnio('PageUp', '2028-03-31', 2028)).toBe('2028-02-29');
  });

  it('Inicio/Fin: lunes y domingo de la fila visible, recortada al mes', () => {
    // Miércoles 11 de marzo de 2026: su semana es 9–15.
    expect(destinoEnAnio('Home', '2026-03-11', A)).toBe('2026-03-09');
    expect(destinoEnAnio('End', '2026-03-11', A)).toBe('2026-03-15');
    // Jueves 1 de enero: la semana empieza en 2025; la fila visible, en el 1.
    expect(destinoEnAnio('Home', '2026-01-01', A)).toBe('2026-01-01');
    // Lunes 30 de marzo: la semana acaba el 5 de abril; la fila visible, el 31.
    expect(destinoEnAnio('End', '2026-03-30', A)).toBe('2026-03-31');
    expect(destinoEnAnio('Home', '2026-03-30', A)).toBe('2026-03-30');
  });

  it('los topes del año: el destino fuera del año es la misma fecha', () => {
    expect(destinoEnAnio('ArrowLeft', '2026-01-01', A)).toBe('2026-01-01');
    expect(destinoEnAnio('ArrowUp', '2026-01-01', A)).toBe('2026-01-01');
    expect(destinoEnAnio('PageUp', '2026-01-01', A)).toBe('2026-01-01');
    expect(destinoEnAnio('ArrowRight', '2026-12-31', A)).toBe('2026-12-31');
    expect(destinoEnAnio('ArrowDown', '2026-12-31', A)).toBe('2026-12-31');
    expect(destinoEnAnio('PageDown', '2026-12-31', A)).toBe('2026-12-31');
    expect(destinoEnAnio('ArrowUp', '2026-01-03', A)).toBe('2026-01-03');
    expect(destinoEnAnio('PageUp', '2026-01-20', A)).toBe('2026-01-20');
    expect(destinoEnAnio('PageDown', '2026-12-05', A)).toBe('2026-12-05');
  });

  it('una tecla que no es de navegación da null', () => {
    expect(destinoEnAnio('a', '2026-03-10', A)).toBeNull();
    expect(destinoEnAnio('Enter', '2026-03-10', A)).toBeNull();
    expect(destinoEnAnio('Tab', '2026-03-10', A)).toBeNull();
  });
});
