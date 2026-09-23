import { describe, expect, it } from 'vitest';

import { formatearFechaSinZona } from './relativo';

describe('formatearFechaSinZona', () => {
  it('formatea un día de calendario sin hora como fecha corta española', () => {
    expect(formatearFechaSinZona('2026-05-01', 'Europe/Madrid')).toBe('01/05/2026');
  });

  it('el domingo del salto de marzo da el mismo día en Madrid y en Canarias', () => {
    // 2026-03-29: en Madrid el salto es a las 02:00 y en Canarias a las 01:00.
    // El anclaje al mediodía (los saltos caen de madrugada; a las 12:00 no hay
    // hora inexistente ni ambigua en ninguna zona) garantiza que el día que
    // entra es el que sale: 29 en las dos zonas.
    expect(formatearFechaSinZona('2026-03-29', 'Europe/Madrid')).toBe('29/03/2026');
    expect(formatearFechaSinZona('2026-03-29', 'Atlantic/Canary')).toBe('29/03/2026');
  });

  it('el domingo del cambio de octubre tampoco se mueve', () => {
    expect(formatearFechaSinZona('2026-10-25', 'Europe/Madrid')).toBe('25/10/2026');
  });

  it('rechaza una cadena que no es AAAA-MM-DD', () => {
    expect(() => formatearFechaSinZona('29/03/2026', 'Europe/Madrid')).toThrow();
    expect(() => formatearFechaSinZona('2026-3-9', 'Europe/Madrid')).toThrow();
  });

  it('rechaza un día de calendario que no existe, aunque el formato sea correcto', () => {
    // Febrero de 2026 tiene 28 días: sin esta comprobación, `new
    // TZDate(2026, 1, 30, ...)` normaliza en silencio al 2 de marzo.
    expect(() => formatearFechaSinZona('2026-02-30', 'Europe/Madrid')).toThrow();
    // No hay mes 13: sin la comprobación, se desliza al año siguiente.
    expect(() => formatearFechaSinZona('2026-13-01', 'Europe/Madrid')).toThrow();
  });

  it('el día del cambio de hora en Chile da el mismo día en una zona cuyo salto cae a medianoche', () => {
    // El anclaje al mediodía se justifica frente a medianoche, no frente a
    // Europe/Madrid (ahí el salto es 02:00 → 03:00 y medianoche existe:
    // .claude/rules/fechas.md). America/Santiago sí cambia la hora exactamente
    // a las 00:00: el domingo 5 de abril de 2026 las 00:00 retroceden a las
    // 23:00 del día anterior, así que esa hora se vive dos veces. Si el
    // anclaje fuera a medianoche, ese instante sería ambiguo y podría
    // resolverse en el día equivocado. Con el mediodía como ancla —estable,
    // sin ambigüedad, a horas del salto— el día que entra es el que sale
    // también en esta zona.
    expect(formatearFechaSinZona('2026-04-05', 'America/Santiago')).toBe('05/04/2026');
  });
});
