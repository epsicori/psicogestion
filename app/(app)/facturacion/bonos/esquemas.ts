import { z } from 'zod';

import { aCentimos } from '@/lib/dinero/importe';
import { esFechaDeCalendario } from '@/lib/fechas/calendario';
import { t } from '@/lib/i18n';

import { LIMITE_CENTIMOS, leerCentimos, opcional } from '../esquemas';

/** Tope de sesiones por bono: una guarda de errata, no una regla del negocio. */
export const MAX_SESIONES = 999;

/**
 * El bono, validado igual en el formulario y en la acción (T-027 §1.2). `hoy` lo pasa quien llama:
 * aquí no se lee el reloj. Sin `transform`: la salida sigue siendo texto y `parse(parse(x)) = parse(x)`,
 * porque el cliente manda a la acción la salida del esquema.
 *
 * El importe es estrictamente mayor que 0: la base (`bonos_importe_ck`) rechaza también el 0.
 */
export function crearEsquemaBono(hoy: string) {
  return z.object({
    pacienteId: z.uuid({ error: t('bonos.eligePaciente') }),
    sesionesTotales: z
      .string({ error: t('bonos.sesionesNoValidas') })
      .trim()
      .regex(/^[1-9]\d{0,2}$/, { error: t('bonos.sesionesNoValidas'), abort: true })
      .refine((v) => Number(v) >= 1 && Number(v) <= MAX_SESIONES, { error: t('bonos.sesionesNoValidas') }),
    importe: z
      .string({ error: t('bonos.importeNoValido') })
      .trim()
      .refine((v) => leerCentimos(v) !== null, { error: t('bonos.importeNoValido'), abort: true })
      .refine((v) => (leerCentimos(v) ?? 0) >= 0, { error: t('bonos.importeNegativo'), abort: true })
      .refine((v) => leerCentimos(v) !== 0, { error: t('bonos.importeCero'), abort: true })
      .refine((v) => (leerCentimos(v) ?? 0) <= LIMITE_CENTIMOS, { error: t('bonos.importeDemasiadoGrande') }),
    // Cadenas `AAAA-MM-DD` comparadas como cadenas.
    caducidad: opcional(
      z
        .string({ error: t('bonos.caducidadNoValida') })
        .regex(/^\d{4}-\d{2}-\d{2}$/, { error: t('bonos.caducidadNoValida'), abort: true })
        .refine(esFechaDeCalendario, { error: t('bonos.caducidadNoValida'), abort: true })
        .refine((v) => v >= hoy, { error: t('bonos.caducidadPasada') }),
    ),
  });
}

export type EntradaBono = z.input<ReturnType<typeof crearEsquemaBono>>;
export type DatosBono = z.output<ReturnType<typeof crearEsquemaBono>>;

/** La huella de un envío: lo que la base guardaría, en orden fijo y con el importe en céntimos. */
export function huellaDeBono(datos: DatosBono): string {
  return JSON.stringify([
    datos.pacienteId,
    Number(datos.sesionesTotales),
    aCentimos(datos.importe),
    datos.caducidad ?? null,
  ]);
}
