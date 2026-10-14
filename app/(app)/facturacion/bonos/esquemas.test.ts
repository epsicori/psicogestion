import { describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n';

import { MAX_SESIONES, crearEsquemaBono, huellaDeBono } from './esquemas';

const HOY = '2026-10-14';
const PACIENTE = '6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60';
const BASE = { pacienteId: PACIENTE, sesionesTotales: '5', importe: '150,00' };

const esquema = crearEsquemaBono(HOY);

function mensajes(entrada: Record<string, unknown>, campo: string): string[] {
  const r = esquema.safeParse(entrada);
  if (r.success) return [];
  return r.error.issues.filter((i) => i.path[0] === campo).map((i) => i.message);
}

describe('crearEsquemaBono', () => {
  it('un bono válido pasa y la salida sigue siendo texto (parse∘parse = parse)', () => {
    const r = esquema.parse({ ...BASE, caducidad: '2027-01-31' });
    expect(r).toEqual({ ...BASE, caducidad: '2027-01-31' });
    expect(esquema.parse(r)).toEqual(r);
  });

  it('el tope de sesiones es 999', () => {
    expect(MAX_SESIONES).toBe(999);
    expect(esquema.safeParse({ ...BASE, sesionesTotales: '999' }).success).toBe(true);
  });

  it.each(['0', '-1', '1.5', '1000', '', 'abc', '1e2', '00'])('sesionesTotales %j → no válidas', (valor) => {
    expect(mensajes({ ...BASE, sesionesTotales: valor }, 'sesionesTotales')).toEqual([t('bonos.sesionesNoValidas')]);
  });

  it('importe 0 → importeCero, no por formato', () => {
    expect(mensajes({ ...BASE, importe: '0' }, 'importe')).toEqual([t('bonos.importeCero')]);
    expect(mensajes({ ...BASE, importe: '0,00' }, 'importe')).toEqual([t('bonos.importeCero')]);
  });

  it('importe negativo → falla, pero no por formato ni por cero', () => {
    const m = mensajes({ ...BASE, importe: '-5' }, 'importe');
    expect(m).toHaveLength(1);
    expect(m[0]).not.toBe(t('bonos.importeNoValido'));
    expect(m[0]).not.toBe(t('bonos.importeCero'));
  });

  it('importe ilegible → importeNoValido; enorme → importeDemasiadoGrande', () => {
    expect(mensajes({ ...BASE, importe: 'mucho' }, 'importe')).toEqual([t('bonos.importeNoValido')]);
    expect(mensajes({ ...BASE, importe: '99.999.999.999,99' }, 'importe')).toEqual([t('bonos.importeDemasiadoGrande')]);
  });

  it('caducidad: ayer → caducidadPasada; hoy vale; 2026-02-30 → caducidadNoValida; vacía = sin caducidad', () => {
    expect(mensajes({ ...BASE, caducidad: '2026-10-13' }, 'caducidad')).toEqual([t('bonos.caducidadPasada')]);
    expect(esquema.safeParse({ ...BASE, caducidad: HOY }).success).toBe(true);
    expect(mensajes({ ...BASE, caducidad: '2026-02-30' }, 'caducidad')).toEqual([t('bonos.caducidadNoValida')]);
    expect(mensajes({ ...BASE, caducidad: 'mañana' }, 'caducidad')).toEqual([t('bonos.caducidadNoValida')]);
    const sin = esquema.safeParse({ ...BASE, caducidad: '' });
    expect(sin.success && sin.data.caducidad).toBeUndefined();
  });

  it('paciente que no es uuid → eligePaciente', () => {
    expect(mensajes({ ...BASE, pacienteId: '' }, 'pacienteId')).toEqual([t('bonos.eligePaciente')]);
  });
});

describe('huellaDeBono', () => {
  it('es estable y distingue cada campo', () => {
    const base = esquema.parse(BASE);
    expect(huellaDeBono(base)).toBe(huellaDeBono(esquema.parse({ ...BASE })));
    expect(huellaDeBono(base)).toBe(JSON.stringify([PACIENTE, 5, 15000, null]));
    expect(huellaDeBono(esquema.parse({ ...BASE, sesionesTotales: '6' }))).not.toBe(huellaDeBono(base));
    expect(huellaDeBono(esquema.parse({ ...BASE, importe: '150,01' }))).not.toBe(huellaDeBono(base));
    expect(huellaDeBono(esquema.parse({ ...BASE, caducidad: '2027-01-01' }))).not.toBe(huellaDeBono(base));
  });
});
