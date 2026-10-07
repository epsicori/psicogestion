import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { t } from '@/lib/i18n';

import { FORMAS_DE_PAGO, LIMITE_CENTIMOS, crearEsquemaCobro, huellaDeCobro, importeParaBd } from './esquemas';

const HOY = '2026-10-06';
// Un uuid v4, como los de `gen_random_uuid()`: `z.uuid()` exige la versión y la variante.
const PACIENTE = '6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60';

const base = {
  pacienteId: PACIENTE,
  importe: '60,00',
  fecha: HOY,
  formaPago: 'efectivo',
};

function erroresDe(entrada: unknown): Record<string, string[] | undefined> {
  const r = crearEsquemaCobro(HOY).safeParse(entrada);
  return r.success ? {} : z.flattenError(r.error).fieldErrors;
}

describe('crearEsquemaCobro · el importe', () => {
  it.each(['0', '0,00', '-0', '0.00'])('rechaza %s: el importe no puede ser cero', (importe) => {
    expect(erroresDe({ ...base, importe }).importe).toEqual([t('cobros.importeCero')]);
  });

  it.each(['doce', '', '12,5,0', '1.23,50'])('rechaza «%s», que no es un importe', (importe) => {
    expect(erroresDe({ ...base, importe }).importe?.[0]).toBe(t('cobros.importeNoValido'));
  });

  it('acepta el límite de numeric(12,2) y rechaza un céntimo más', () => {
    expect(LIMITE_CENTIMOS).toBe(999_999_999_999);
    expect(erroresDe({ ...base, importe: '9999999999,99' }).importe).toBeUndefined();
    expect(erroresDe({ ...base, importe: '-9999999999,99', motivo: 'x' }).importe).toBeUndefined();
    expect(erroresDe({ ...base, importe: '10000000000,00' }).importe).toEqual([t('cobros.importeDemasiadoGrande')]);
  });

  it('una devolución sin motivo es un error en el campo motivo', () => {
    const errores = erroresDe({ ...base, importe: '-20,00' });
    expect(errores.motivo).toEqual([t('cobros.devolucionNecesitaMotivo')]);
    expect(errores.importe).toBeUndefined();
  });

  it('un motivo de solo espacios no cuenta como motivo', () => {
    expect(erroresDe({ ...base, importe: '-20,00', motivo: '   ' }).motivo).toEqual([
      t('cobros.devolucionNecesitaMotivo'),
    ]);
  });

  it('una devolución con motivo pasa, y la salida conserva el texto del importe', () => {
    const r = crearEsquemaCobro(HOY).parse({ ...base, importe: ' -20,00 ', motivo: 'Sesión cobrada dos veces' });
    expect(r.importe).toBe('-20,00');
    expect(r.motivo).toBe('Sesión cobrada dos veces');
  });

  it('un cobro positivo no necesita motivo', () => {
    expect(erroresDe(base)).toEqual({});
  });
});

describe('crearEsquemaCobro · la fecha', () => {
  it('rechaza la de mañana', () => {
    expect(erroresDe({ ...base, fecha: '2026-10-07' }).fecha).toEqual([t('cobros.fechaFutura')]);
  });

  it('acepta la de hoy y la de ayer', () => {
    expect(erroresDe({ ...base, fecha: HOY }).fecha).toBeUndefined();
    expect(erroresDe({ ...base, fecha: '2026-10-05' }).fecha).toBeUndefined();
  });

  it('rechaza un día que no existe en el calendario', () => {
    expect(erroresDe({ ...base, fecha: '2026-02-30' }).fecha?.[0]).toBe(t('cobros.fechaNoValida'));
    expect(erroresDe({ ...base, fecha: '06/10/2026' }).fecha?.[0]).toBe(t('cobros.fechaNoValida'));
  });

  it('«hoy» es el que recibe el esquema, no el reloj de la máquina', () => {
    const r = crearEsquemaCobro('2030-01-01').safeParse({ ...base, fecha: '2029-12-31' });
    expect(r.success).toBe(true);
  });
});

describe('crearEsquemaCobro · el resto de campos', () => {
  it('el paciente es un uuid', () => {
    expect(erroresDe({ ...base, pacienteId: 'Ana' }).pacienteId).toBeDefined();
  });

  it('la forma de pago es una de las cinco del enum', () => {
    expect(FORMAS_DE_PAGO).toEqual(['efectivo', 'transferencia', 'tarjeta', 'bizum', 'otro']);
    expect(erroresDe({ ...base, formaPago: 'cheque' }).formaPago).toEqual([t('cobros.formaPagoNoValida')]);
    expect(erroresDe({ ...base, formaPago: '' }).formaPago).toEqual([t('cobros.formaPagoNoValida')]);
  });

  it('referencia y motivo vacíos salen como undefined', () => {
    const r = crearEsquemaCobro(HOY).parse({ ...base, referencia: '', motivo: '  ' });
    expect(r.referencia).toBeUndefined();
    expect(r.motivo).toBeUndefined();
  });

  it('limita la referencia a 120 y el motivo a 300', () => {
    expect(erroresDe({ ...base, referencia: 'x'.repeat(121) }).referencia).toEqual([
      t('cobros.referenciaDemasiadoLarga'),
    ]);
    expect(erroresDe({ ...base, referencia: 'x'.repeat(120) }).referencia).toBeUndefined();
    expect(erroresDe({ ...base, importe: '-1', motivo: 'x'.repeat(301) }).motivo).toEqual([
      t('cobros.motivoDemasiadoLargo'),
    ]);
  });

  it('es idempotente: la salida es una entrada válida e igual a sí misma (el cliente manda la salida)', () => {
    const esquema = crearEsquemaCobro(HOY);
    for (const entrada of [
      { ...base, importe: ' 1.234,56 € ', referencia: ' TR-1 ' },
      { ...base, importe: '-20,00', motivo: ' Duplicado ', referencia: '' },
    ]) {
      const una = esquema.parse(entrada);
      expect(esquema.parse(una)).toEqual(una);
    }
  });
});

describe('importeParaBd · céntimos a numeric sin coma flotante', () => {
  it.each([
    [1250, '12.50'],
    [-2000, '-20.00'],
    [5, '0.05'],
    [-5, '-0.05'],
    [100, '1.00'],
    [999_999_999_999, '9999999999.99'],
    [-999_999_999_999, '-9999999999.99'],
  ])('%i → %s', (c, texto) => {
    expect(importeParaBd(c)).toBe(texto);
  });

  it('lanza con algo que no son céntimos enteros', () => {
    expect(() => importeParaBd(12.5)).toThrow();
  });
});

describe('huellaDeCobro (R4.1)', () => {
  const datos = (resto: Record<string, unknown> = {}) =>
    crearEsquemaCobro(HOY).parse({ ...base, ...resto });

  it.each(['60', '60.00', ' 60,00 € '])('«%s» da la misma huella que «60,00»', (importe) => {
    expect(huellaDeCobro(datos({ importe }))).toBe(huellaDeCobro(datos({ importe: '60,00' })));
  });

  it('el orden de las claves no cambia la huella', () => {
    const a = datos();
    const b = {
      formaPago: a.formaPago,
      fecha: a.fecha,
      importe: a.importe,
      pacienteId: a.pacienteId,
    } as typeof a;
    expect(huellaDeCobro(b)).toBe(huellaDeCobro(a));
  });

  it('un importe positivo con motivo y sin motivo da la misma huella', () => {
    expect(huellaDeCobro(datos({ motivo: 'x' }))).toBe(huellaDeCobro(datos()));
  });

  it('una devolución con motivos distintos da huellas distintas', () => {
    expect(huellaDeCobro(datos({ importe: '-20,00', motivo: 'a' }))).not.toBe(
      huellaDeCobro(datos({ importe: '-20,00', motivo: 'b' })),
    );
  });

  it.each([
    ['pacienteId', '7f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60'],
    ['fecha', '2026-10-05'],
    ['formaPago', 'bizum'],
    ['referencia', 'TR-1'],
  ])('cambiar %s cambia la huella', (campo, valor) => {
    expect(huellaDeCobro(datos({ [campo]: valor }))).not.toBe(huellaDeCobro(datos()));
  });
});
