import { describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n';

import { aFilaDePendiente, importeDeBd, pildoraDe, type FilaVista } from './presentacion';

function vista(devengado: number, cobrado: number, extra: Partial<FilaVista> = {}): FilaVista {
  const diferencia = devengado - cobrado;
  return {
    paciente_id: 'p-1',
    profesional_id: 'pro-1',
    devengado_centimos: devengado,
    cobrado_centimos: cobrado,
    pendiente_centimos: Math.max(diferencia, 0),
    excedente_centimos: Math.max(-diferencia, 0),
    estado: diferencia > 0 ? 'pendiente' : diferencia === 0 ? 'cobrado' : 'cobrado_de_mas',
    citas_sin_tarifa: 0,
    ...extra,
  };
}

describe('aFilaDePendiente · reutiliza pendiente() y no tapa una divergencia', () => {
  it('100 € con 60 cobrados: pendiente de 40 y parcial', () => {
    expect(aFilaDePendiente(vista(10000, 6000))).toEqual({
      pacienteId: 'p-1',
      estado: 'pendiente',
      parcial: true,
      pendiente: 4000,
      excedente: 0,
      cobrado: 6000,
      citasSinTarifa: 0,
    });
  });

  it('sin nada cobrado es pendiente, no parcial', () => {
    expect(aFilaDePendiente(vista(10000, 0)).parcial).toBe(false);
  });

  it('cobrado del todo y cobrado de más con su excedente', () => {
    expect(aFilaDePendiente(vista(10000, 10000))).toMatchObject({ estado: 'cobrado', pendiente: 0, excedente: 0 });
    expect(aFilaDePendiente(vista(10000, 11000))).toMatchObject({
      estado: 'cobrado_de_mas',
      pendiente: 0,
      excedente: 1000,
      parcial: false,
    });
  });

  it('lleva las citas sin tarifa', () => {
    expect(aFilaDePendiente(vista(0, 0, { citas_sin_tarifa: 2 })).citasSinTarifa).toBe(2);
  });

  it.each([
    ['estado', { estado: 'cobrado' }],
    ['pendiente', { pendiente_centimos: 3999 }],
    ['excedente', { excedente_centimos: 1 }],
  ])('lanza si la vista y pendiente() no coinciden en %s', (_, cambio) => {
    expect(() => aFilaDePendiente(vista(10000, 6000, cambio))).toThrow();
  });

  it.each([
    'paciente_id',
    'profesional_id',
    'devengado_centimos',
    'cobrado_centimos',
    'pendiente_centimos',
    'excedente_centimos',
    'estado',
    'citas_sin_tarifa',
  ] as const)('lanza si %s llega nulo', (columna) => {
    expect(() => aFilaDePendiente(vista(10000, 6000, { [columna]: null }))).toThrow();
  });
});

describe('pildoraDe · tres tonos, sin rojo', () => {
  it('cobrado → success «Cobrado»', () => {
    expect(pildoraDe(aFilaDePendiente(vista(100, 100)))).toEqual({ tono: 'success', texto: t('cobros.pildora.cobrado') });
  });
  it('pendiente sin cobros → warning «Pendiente»', () => {
    expect(pildoraDe(aFilaDePendiente(vista(100, 0)))).toEqual({ tono: 'warning', texto: t('cobros.pildora.pendiente') });
  });
  it('pendiente con cobros → warning «Parcial»', () => {
    expect(pildoraDe(aFilaDePendiente(vista(100, 40)))).toEqual({ tono: 'warning', texto: t('cobros.pildora.parcial') });
  });
  it('cobrado de más → warning «Cobrado de más»', () => {
    expect(pildoraDe(aFilaDePendiente(vista(100, 140)))).toEqual({
      tono: 'warning',
      texto: t('cobros.pildora.cobradoDeMas'),
    });
  });
});

describe('importeDeBd · el numeric que devuelve PostgREST como texto, a céntimos sin coma flotante', () => {
  it.each([
    ['12.50', 1250],
    ['-20.00', -2000],
    ['0.05', 5],
    ['-0.05', -5],
    ['9999999999.99', 999_999_999_999],
  ])('%s → %i', (texto, centimos) => {
    expect(importeDeBd(texto)).toBe(centimos);
  });

  it.each(['12,50', '1.234,56', '12.5', '', 'doce'])('lanza con «%s»', (texto) => {
    expect(() => importeDeBd(texto)).toThrow();
  });
});
