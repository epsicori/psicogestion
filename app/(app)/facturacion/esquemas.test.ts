import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { t } from '@/lib/i18n';

import {
  FORMAS_DE_PAGO,
  LIMITE_CENTIMOS,
  crearEsquemaCobro,
  esquemaAsignacion,
  huellaDeCobro,
  importeParaBd,
} from './esquemas';

const HOY = '2026-10-06';
// Un uuid v4, como los de `gen_random_uuid()`: `z.uuid()` exige la versión y la variante.
const PACIENTE = '6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60';

// Un uuid v4 de factura del espejo.
const FACTURA = '8a2b3c4d-5e6f-4a70-9b81-1c2d3e4f5a61';

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

  it('el cobro contra una factura y el mismo sin factura dan huellas distintas (T-023b)', () => {
    expect(huellaDeCobro(datos({ facturaEspejoId: FACTURA }))).not.toBe(huellaDeCobro(datos()));
  });

  it('la factura va al final del arreglo y, sin ella, es null (T-023b)', () => {
    expect(JSON.parse(huellaDeCobro(datos())).at(-1)).toBeNull();
    expect(JSON.parse(huellaDeCobro(datos({ facturaEspejoId: FACTURA }))).at(-1)).toBe(FACTURA);
    expect(JSON.parse(huellaDeCobro(datos())).slice(0, 6)).toEqual([PACIENTE, 6000, HOY, 'efectivo', null, null]);
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

describe('crearEsquemaCobro · la factura (T-023b)', () => {
  it('acepta un cobro sin factura y con un uuid de factura', () => {
    expect(erroresDe(base)).toEqual({});
    expect(erroresDe({ ...base, facturaEspejoId: FACTURA })).toEqual({});
  });

  it('rechaza una factura que no es un uuid, con su mensaje en su campo', () => {
    expect(erroresDe({ ...base, facturaEspejoId: 'F-2026-0001' }).facturaEspejoId).toEqual([
      t('cobros.facturas.facturaNoValida'),
    ]);
  });

  it('la salida conserva la factura y parse(parse(x)) es parse(x)', () => {
    const esquema = crearEsquemaCobro(HOY);
    const una = esquema.parse({ ...base, facturaEspejoId: FACTURA });
    expect(una.facturaEspejoId).toBe(FACTURA);
    expect(esquema.parse(una)).toEqual(una);
  });
});

describe('esquemaAsignacion (T-023b)', () => {
  it('acepta dos uuid', () => {
    expect(esquemaAsignacion.safeParse({ cobroId: PACIENTE, facturaEspejoId: FACTURA }).success).toBe(true);
  });

  it('un cobro que no es uuid da «Elige un cobro» en su campo', () => {
    const r = esquemaAsignacion.safeParse({ cobroId: '', facturaEspejoId: FACTURA });
    expect(r.success).toBe(false);
    if (!r.success) expect(z.flattenError(r.error).fieldErrors.cobroId).toEqual([t('cobros.facturas.eligeCobro')]);
  });

  it('una factura que no es uuid falla', () => {
    expect(esquemaAsignacion.safeParse({ cobroId: PACIENTE, facturaEspejoId: 'x' }).success).toBe(false);
  });
});
