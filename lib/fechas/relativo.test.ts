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
    // a las 00:00, pero el domingo 5 de abril de 2026 la hora ambigua (vivida
    // dos veces) es la 23:00-24:00 del día ANTERIOR (el 4), no la medianoche
    // del 5: a las 00:00 del 5 el reloj ya retrocedió y esa medianoche existe
    // una sola vez (H4, revisión de cierre). El caso sigue siendo el correcto
    // para probar el mediodía como ancla: es la fecha real en la que esta
    // zona mueve el reloj a las 00:00, y el mediodía —lejos de cualquier
    // salto— da el mismo día que entra.
    expect(formatearFechaSinZona('2026-04-05', 'America/Santiago')).toBe('05/04/2026');
  });

  it('una medianoche que no existe también da el día correcto (H4)', () => {
    // America/Santiago entra en horario de verano el domingo 6 de septiembre
    // de 2026: las 00:00 saltan directas a la 01:00, así que la medianoche de
    // ese día no existe como instante local. Es el caso que H4 pedía cerrar:
    // ¿un ancla a medianoche fallaría aquí? Se comprobó con America/Havana
    // (salto idéntico el 08-03-2026) y con esta misma fecha construyendo un
    // `TZDate` directo a las 00:00 locales: en ambas, `@date-fns/tz` no
    // lanza ni desliza al día siguiente — resuelve la hora inexistente hacia
    // ADELANTE, a la 01:00 del MISMO día. Por eso ningún caso de salto de
    // primavera (el hueco siempre avanza el reloj, nunca lo retrasa) permite
    // hacer fallar un ancla a medianoche con esta librería: no hay hueco que
    // cruce la frontera del día. La prueba documenta esto en vez de afirmar
    // una falla que no ocurre; el mediodía sigue siendo el ancla elegida
    // porque es la que no depende de este detalle de resolución de la
    // librería (decisión de `.claude/rules/fechas.md`).
    expect(formatearFechaSinZona('2026-09-06', 'America/Santiago')).toBe('06/09/2026');
  });
});
