import { describe, expect, it } from 'vitest';

import { fechaDeSesion } from './fecha';

describe('fechaDeSesion', () => {
  it('da la fecha LOCAL del centro, no la UTC: 23:30 UTC de agosto ya es el día siguiente en Madrid', () => {
    expect(fechaDeSesion(new Date('2026-08-26T23:30:00.000Z'), 'Europe/Madrid')).toBe('2026-08-27');
    expect(fechaDeSesion(new Date('2026-08-26T23:30:00.000Z'), 'UTC')).toBe('2026-08-26');
  });

  it('en invierno el desfase es de una hora', () => {
    expect(fechaDeSesion(new Date('2026-12-31T23:30:00.000Z'), 'Europe/Madrid')).toBe('2027-01-01');
    expect(fechaDeSesion(new Date('2026-12-31T22:30:00.000Z'), 'Europe/Madrid')).toBe('2026-12-31');
  });

  it('respeta una zona del otro lado del Atlántico', () => {
    expect(fechaDeSesion(new Date('2026-08-27T02:00:00.000Z'), 'America/Bogota')).toBe('2026-08-26');
  });
});
