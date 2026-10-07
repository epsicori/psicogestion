import { z } from 'zod';

import { aCentimos, comprobarCentimos, type Centimos } from '@/lib/dinero/importe';
import { t } from '@/lib/i18n';

/** El enum `forma_pago` de la base (T-021), en el mismo orden. */
export const FORMAS_DE_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'bizum', 'otro'] as const;

/** `numeric(12,2)`: 9.999.999.999,99 €. */
export const LIMITE_CENTIMOS = 999_999_999_999;

/** `aCentimos` lanza con lo que no es un importe; aquí eso es `null`. */
function leerCentimos(texto: string): Centimos | null {
  try {
    return aCentimos(texto);
  } catch {
    return null;
  }
}

/** «» o solo espacios (lo que manda un campo vacío) → `undefined`, como en `pacientes/esquemas.ts`. */
const opcional = (esquema: z.ZodType<string>) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), esquema.optional());

/**
 * Ida y vuelta en UTC: `new Date('2026-02-30')` no da NaN, el motor lo corre al 2 de marzo.
 * Solo es una fecha de calendario si vuelve igual que entró. No hay reloj: no se mira «ahora».
 */
function esFechaDeCalendario(valor: string): boolean {
  const fecha = new Date(`${valor}T12:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

/**
 * El cobro, validado igual en el formulario y en la acción (T-023 §1.5). `hoy` es el día en la
 * zona que corresponda (la de la organización en el cliente, la del centro del paciente en la
 * acción), y lo pasa quien llama: aquí no se lee el reloj.
 *
 * **Sin `transform` en el importe**: la salida sigue siendo el texto, porque el cliente manda a
 * la acción la salida del esquema y la acción lo vuelve a validar. `parse(parse(x))` es
 * `parse(x)`.
 */
export function crearEsquemaCobro(hoy: string) {
  return z
    .object({
      pacienteId: z.uuid({ error: t('cobros.eligePaciente') }),
      importe: z
        .string({ error: t('cobros.importeNoValido') })
        .trim()
        .refine((v) => leerCentimos(v) !== null, { error: t('cobros.importeNoValido'), abort: true })
        .refine((v) => leerCentimos(v) !== 0, { error: t('cobros.importeCero'), abort: true })
        .refine((v) => Math.abs(leerCentimos(v) ?? 0) <= LIMITE_CENTIMOS, {
          error: t('cobros.importeDemasiadoGrande'),
        }),
      // Cadenas `AAAA-MM-DD` comparadas como cadenas: aquí no se construye «ahora».
      fecha: z
        .string({ error: t('cobros.fechaNoValida') })
        .regex(/^\d{4}-\d{2}-\d{2}$/, { error: t('cobros.fechaNoValida'), abort: true })
        .refine(esFechaDeCalendario, { error: t('cobros.fechaNoValida'), abort: true })
        .refine((v) => v <= hoy, { error: t('cobros.fechaFutura') }),
      formaPago: z.enum(FORMAS_DE_PAGO, { error: t('cobros.formaPagoNoValida') }),
      referencia: opcional(z.string().trim().max(120, { error: t('cobros.referenciaDemasiadoLarga') })),
      motivo: opcional(z.string().trim().max(300, { error: t('cobros.motivoDemasiadoLargo') })),
    })
    .superRefine((datos, ctx) => {
      const centimos = leerCentimos(datos.importe);
      if (centimos !== null && centimos < 0 && datos.motivo === undefined) {
        ctx.addIssue({ code: 'custom', path: ['motivo'], message: t('cobros.devolucionNecesitaMotivo') });
      }
    });
}

export type EntradaCobro = z.input<ReturnType<typeof crearEsquemaCobro>>;
export type DatosCobro = z.output<ReturnType<typeof crearEsquemaCobro>>;

/**
 * Céntimos → `'12.50'` / `'-20.00'`, el texto que `numeric(12,2)` lee sin ambigüedad. Por
 * aritmética entera: dividir entre 100 en coma flotante y formatear es como se pierde un céntimo.
 */
export function importeParaBd(c: Centimos): string {
  comprobarCentimos(c, 'El importe');
  const absoluto = Math.abs(c);
  const centimos = absoluto % 100;
  const euros = (absoluto - centimos) / 100;
  return `${c < 0 ? '-' : ''}${euros}.${String(centimos).padStart(2, '0')}`;
}

/** La huella de un envío (R4.1): lo que la base guardaría, en orden fijo y con el importe en céntimos. */
export function huellaDeCobro(datos: DatosCobro): string {
  const centimos = aCentimos(datos.importe);
  return JSON.stringify([
    datos.pacienteId,
    centimos,
    datos.fecha,
    datos.formaPago,
    datos.referencia ?? null,
    centimos < 0 ? (datos.motivo ?? null) : null,
  ]);
}
