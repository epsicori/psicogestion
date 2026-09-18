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
});
