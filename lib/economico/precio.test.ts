import { describe, expect, it } from 'vitest';

import { fechaLocal, proponerLinea, type TarifaLeida } from './precio';

// T-046 · CA8 y CA10. El día de la cita es el día LOCAL de su zona (no el UTC), la tarifa
// vigente da precio y régimen, y sin tarifa del paciente el régimen queda sin marcar: nunca se
// toma de tipos_terapia.regimen.

const TIPO = '11111111-1111-4111-8111-111111111111';
const OTRO_TIPO = '22222222-2222-4222-8222-222222222222';

function tarifa(p: Partial<TarifaLeida>): TarifaLeida {
  return {
    tipo_terapia_id: TIPO,
    importe: '50.00',
    regimen_iva: 'exento_sanitario',
    vigente_desde: '2026-01-01',
    orden: 1,
    ...p,
  };
}

describe('fechaLocal', () => {
  it('2026-03-29 00:30 en Madrid es el 29, aunque en UTC sea el 28 a las 23:30 (aún +01:00)', () => {
    expect(fechaLocal('2026-03-28T23:30:00Z', 'Europe/Madrid')).toBe('2026-03-29');
  });

  it('en Santiago de Chile el mismo instante es todavía el 28', () => {
    expect(fechaLocal('2026-03-28T23:30:00Z', 'America/Santiago')).toBe('2026-03-28');
  });

  it('acepta el formato con desfase que devuelve PostgREST', () => {
    expect(fechaLocal('2026-03-28T23:30:00+00:00', 'Europe/Madrid')).toBe('2026-03-29');
  });
});

describe('proponerLinea', () => {
  const tarifas = [
    tarifa({ importe: '50.00', vigente_desde: '2026-01-01', orden: 1 }),
    tarifa({ importe: '60.00', regimen_iva: 'general', vigente_desde: '2026-03-29', orden: 2 }),
    tarifa({ tipo_terapia_id: OTRO_TIPO, importe: '99.00', vigente_desde: '2026-01-01', orden: 1 }),
  ];

  it('Madrid 00:30 del 29: toma la tarifa vigente desde el 29, con su régimen', () => {
    const cita = { inicio: '2026-03-28T23:30:00Z', zona_horaria: 'Europe/Madrid', tipo_terapia_id: TIPO };
    expect(proponerLinea(cita, tarifas, { tarifa_base: '40.00' })).toEqual({
      precioCentimos: 6000,
      regimen: 'general',
    });
  });

  it('Santiago, mismo instante: aún el 28, toma la anterior', () => {
    const cita = { inicio: '2026-03-28T23:30:00Z', zona_horaria: 'America/Santiago', tipo_terapia_id: TIPO };
    expect(proponerLinea(cita, tarifas, { tarifa_base: '40.00' })).toEqual({
      precioCentimos: 5000,
      regimen: 'exento_sanitario',
    });
  });

  it('el mismo vigente_desde: gana el orden mayor', () => {
    const cita = { inicio: '2026-06-01T10:00:00Z', zona_horaria: 'Europe/Madrid', tipo_terapia_id: TIPO };
    const empatadas = [
      tarifa({ importe: '70.00', vigente_desde: '2026-05-01', orden: 3 }),
      tarifa({ importe: '75.00', regimen_iva: 'general', vigente_desde: '2026-05-01', orden: 4 }),
      tarifa({ importe: '10.00', vigente_desde: '2026-04-01', orden: 9 }),
    ];
    expect(proponerLinea(cita, empatadas, null)).toEqual({ precioCentimos: 7500, regimen: 'general' });
  });

  it('una tarifa futura no cuenta, ni la de otro tipo de terapia', () => {
    const cita = { inicio: '2025-12-01T10:00:00Z', zona_horaria: 'Europe/Madrid', tipo_terapia_id: TIPO };
    expect(proponerLinea(cita, tarifas, { tarifa_base: '40.00' })).toEqual({
      precioCentimos: 4000,
      regimen: null,
    });
  });

  it('sin tarifa del paciente: precio de tarifa_base y régimen sin marcar (CA10)', () => {
    const cita = { inicio: '2026-06-01T10:00:00Z', zona_horaria: 'Europe/Madrid', tipo_terapia_id: OTRO_TIPO };
    // El tipo de terapia trae régimen general; la propuesta no lo usa.
    const tipo = { tarifa_base: '45.50', regimen: 'general' as const };
    expect(proponerLinea(cita, [], tipo)).toEqual({ precioCentimos: 4550, regimen: null });
  });

  it('sin tarifa ni tarifa_base: todo null, nunca 0', () => {
    const cita = { inicio: '2026-06-01T10:00:00Z', zona_horaria: 'Europe/Madrid', tipo_terapia_id: TIPO };
    expect(proponerLinea(cita, [], { tarifa_base: null })).toEqual({ precioCentimos: null, regimen: null });
    expect(proponerLinea(cita, [], null)).toEqual({ precioCentimos: null, regimen: null });
  });

  it('una tarifa_base de 0,00 no propone un 0 silencioso', () => {
    const cita = { inicio: '2026-06-01T10:00:00Z', zona_horaria: 'Europe/Madrid', tipo_terapia_id: TIPO };
    expect(proponerLinea(cita, [], { tarifa_base: '0.00' })).toEqual({ precioCentimos: null, regimen: null });
  });
});
