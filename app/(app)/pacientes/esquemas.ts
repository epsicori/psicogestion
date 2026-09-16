import { z } from 'zod';

import { normalizarNif, normalizarTelefono, validarNif, validarTelefono } from '@/lib/identidad';
import { t } from '@/lib/i18n';

// T-032 · el resto de los campos del alta (fecha de nacimiento, sexo, teléfono, DNI/NIE,
// domicilio, alergias y medicación) se añaden aquí, junto a los dos que ya existían.

/**
 * Convierte «» (lo que manda un `<input>` vacío) en `undefined` antes de validar, para que
 * un campo opcional sin rellenar no dispare su regla de forma (`validarNif`, `validarTelefono`,
 * …). El `transform` de normalización de cada campo va DESPUÉS de su `refine`, para que el
 * mensaje de error se refiera a lo que la persona escribió, no a la forma normalizada.
 */
const opcional = (esquema: z.ZodType<string>) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), esquema.optional());

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const FECHA_MINIMA = new Date('1900-01-01T00:00:00Z');
const EDAD_MAXIMA_ANIOS = 120;

export const esquemaNuevoPaciente = z.object({
  nombre: z
    .string({ error: t('pacientes.introduceElNombre') })
    .trim()
    .min(1, { error: t('pacientes.introduceElNombre') })
    .max(120, { error: t('pacientes.elNombreEsDemasiadoLargo') }),
  apellidos: z
    .string({ error: t('pacientes.introduceLosApellidos') })
    .trim()
    .min(1, { error: t('pacientes.introduceLosApellidos') })
    .max(120, { error: t('pacientes.losApellidosSonDemasiadoLargos') }),
  // Obligatoria desde T-032 (Ley 41/2002 · RD 1093/2010), forma `YYYY-MM-DD` porque es lo que
  // da `<input type="date">`. La comparación con «hoy» ocurre aquí —en la acción y en el
  // cliente— y NUNCA en el render, que es lo que dispara `blocking-prerender-random` en Cache
  // Components.
  fechaNacimiento: z
    .string({ error: t('pacientes.introduceLaFechaDeNacimiento') })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: t('pacientes.fechaDeNacimientoNoValida') })
    .refine(
      (valor) => !Number.isNaN(new Date(`${valor}T00:00:00Z`).getTime()),
      { error: t('pacientes.fechaDeNacimientoNoValida') },
    )
    .refine(
      (valor) => {
        const fecha = new Date(`${valor}T00:00:00Z`);
        return fecha.getTime() <= Date.now() && fecha.getTime() >= FECHA_MINIMA.getTime();
      },
      { error: t('pacientes.fechaDeNacimientoFueraDeRango') },
    )
    .refine(
      (valor) => {
        const fecha = new Date(`${valor}T00:00:00Z`);
        const edadDias = (Date.now() - fecha.getTime()) / UN_DIA_MS;
        return edadDias / 365.2425 <= EDAD_MAXIMA_ANIOS;
      },
      { error: t('pacientes.fechaDeNacimientoFueraDeRango') },
    ),
  // El `<select>` nativo manda «» cuando nadie ha tocado la opción vacía (§1.6): hay que
  // convertirla en `undefined` igual que en los demás campos opcionales, o el `z.enum` la
  // rechazaría por no estar en el catálogo.
  sexo: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['hombre', 'mujer', 'otro'], { error: t('pacientes.sexoNoValido') }).optional(),
  ),
  // Se guarda normalizado en E.164 (`+34600000000`): `wa.me` no admite espacios y lo bonito
  // lo pone `formatearTelefono()` al pintar.
  telefono: opcional(
    z.string().refine(validarTelefono, { error: t('pacientes.telefonoNoValido') }),
  ).transform((valor) => (valor === undefined ? undefined : (normalizarTelefono(valor) ?? undefined))),
  // Se guarda normalizado (mayúsculas, sin espacios ni guiones): es la forma que alimenta el
  // índice ciego, y dos formas del mismo documento no deben dejar de colisionar.
  dni: opcional(z.string().refine(validarNif, { error: t('pacientes.dniNoValido') })).transform(
    (valor) => (valor === undefined ? undefined : normalizarNif(valor)),
  ),
  domicilio: opcional(
    z.string().trim().max(300, { error: t('pacientes.elDomicilioEsDemasiadoLargo') }),
  ),
  alergias: opcional(
    z.string().trim().max(2000, { error: t('pacientes.lasAlergiasSonDemasiadoLargas') }),
  ),
  medicacionActual: opcional(
    z.string().trim().max(2000, { error: t('pacientes.laMedicacionEsDemasiadoLarga') }),
  ),
});

export type DatosNuevoPaciente = z.infer<typeof esquemaNuevoPaciente>;
// El tipo de ENTRADA (antes del `preprocess`/`transform`), para el genérico de `useForm`:
// `zodResolver` exige que `TFieldValues` case con lo que el formulario produce en crudo, y
// eso difiere del de SALIDA en los campos con `preprocess` (`sexo`, `telefono`, `dni`).
export type EntradaNuevoPaciente = z.input<typeof esquemaNuevoPaciente>;
