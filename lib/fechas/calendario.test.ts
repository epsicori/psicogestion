import { describe, expect, it } from 'vitest';

import {
  diaDeLaSemana,
  diasEntre,
  esFechaDeCalendario,
  sumarDias,
  sumarMeses,
} from './calendario';

describe('esFechaDeCalendario', () => {
  it('acepta días que existen', () => {
    expect(esFechaDeCalendario('2026-09-26')).toBe(true);
    expect(esFechaDeCalendario('2028-02-29')).toBe(true);
    expect(esFechaDeCalendario('2026-12-31')).toBe(true);
  });

  it('rechaza días que no existen aunque el formato valga', () => {
    // `new Date('2026-02-30')` sería el 2 de marzo: aquí es falso.
    expect(esFechaDeCalendario('2026-02-30')).toBe(false);
    expect(esFechaDeCalendario('2027-02-29')).toBe(false);
    expect(esFechaDeCalendario('2026-04-31')).toBe(false);
    expect(esFechaDeCalendario('2026-13-01')).toBe(false);
    expect(esFechaDeCalendario('2026-00-10')).toBe(false);
    expect(esFechaDeCalendario('2026-01-00')).toBe(false);
  });

  it('rechaza lo que no tiene forma AAAA-MM-DD', () => {
    expect(esFechaDeCalendario('2026-9-26')).toBe(false);
    expect(esFechaDeCalendario('26/09/2026')).toBe(false);
    expect(esFechaDeCalendario('2026-09-26T00:00')).toBe(false);
    expect(esFechaDeCalendario('')).toBe(false);
  });
});

describe('sumarDias', () => {
  it('suma y resta dentro del mes', () => {
    expect(sumarDias('2026-09-26', 1)).toBe('2026-09-27');
    expect(sumarDias('2026-09-26', -6)).toBe('2026-09-20');
    expect(sumarDias('2026-09-26', 0)).toBe('2026-09-26');
  });

  it('cruza meses de 28, 30 y 31 días', () => {
    expect(sumarDias('2027-02-28', 1)).toBe('2027-03-01');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01');
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('cruza el cambio de año en los dos sentidos', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('no se mueve por el cambio de hora (no hay horas de por medio)', () => {
    expect(sumarDias('2026-03-28', 1)).toBe('2026-03-29');
    expect(sumarDias('2026-03-29', 1)).toBe('2026-03-30');
    expect(sumarDias('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('lanza con una fecha inválida', () => {
    expect(() => sumarDias('2026-02-30', 1)).toThrow();
  });
});

describe('sumarMeses', () => {
  it('suma meses conservando el día', () => {
    expect(sumarMeses('2026-09-15', 1)).toBe('2026-10-15');
    expect(sumarMeses('2026-09-15', -1)).toBe('2026-08-15');
  });

  it('recorta al último día del mes de destino', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(sumarMeses('2026-03-31', 1)).toBe('2026-04-30');
    expect(sumarMeses('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('cruza el cambio de año', () => {
    expect(sumarMeses('2026-12-10', 1)).toBe('2027-01-10');
    expect(sumarMeses('2027-01-10', -1)).toBe('2026-12-10');
    expect(sumarMeses('2026-06-10', 18)).toBe('2027-12-10');
    expect(sumarMeses('2026-06-10', -18)).toBe('2024-12-10');
  });

  it('lanza con una fecha inválida', () => {
    expect(() => sumarMeses('2026-13-01', 1)).toThrow();
  });
});

describe('diasEntre', () => {
  it('cuenta días de calendario', () => {
    expect(diasEntre('2026-09-25', '2026-09-26')).toBe(1);
    expect(diasEntre('2026-09-26', '2026-09-26')).toBe(0);
    expect(diasEntre('2026-09-26', '2026-09-20')).toBe(-6);
  });

  it('cruza meses, años y cambios de hora sin desviarse', () => {
    expect(diasEntre('2026-03-28', '2026-03-30')).toBe(2);
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1);
    expect(diasEntre('2027-02-01', '2027-03-01')).toBe(28);
    expect(diasEntre('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('lanza con una fecha inválida', () => {
    expect(() => diasEntre('2026-02-30', '2026-03-01')).toThrow();
  });
});

describe('diaDeLaSemana', () => {
  it('es ISO: lunes 1, domingo 7', () => {
    expect(diaDeLaSemana('2027-02-01')).toBe(1); // lunes
    expect(diaDeLaSemana('2026-09-26')).toBe(6); // sábado
    expect(diaDeLaSemana('2026-09-27')).toBe(7); // domingo
    expect(diaDeLaSemana('2026-10-01')).toBe(4); // jueves
  });

  it('lanza con una fecha inválida', () => {
    expect(() => diaDeLaSemana('2026-02-30')).toThrow();
  });
});
