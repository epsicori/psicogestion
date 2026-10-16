// T-046 · El esquema del editor del borrador: el MISMO en el formulario (zodResolver) y en la Server
// Action. Lo que entra son los valores del formulario (texto); lo que sale es exactamente la
// `EntradaGuardar` del núcleo, que la vuelve a validar.
import { z } from 'zod';

import { MAX_CANTIDAD, MAX_CONCEPTO, MAX_LINEAS, MAX_NOMBRE, MAX_PRECIO_CENTIMOS } from '@/lib/economico/entrada';
import { aCentimos } from '@/lib/dinero/importe';
import { t } from '@/lib/i18n';
import { validarCif } from '@/lib/identidad/cif';
import { validarNif } from '@/lib/identidad/nif';
import { esquemaCif, esquemaNif } from '@/lib/identidad/esquemas';

const SIN_CONTROL = /[\u0000-\u001f\u007f]/;

const texto = (max: number, mensaje: string) =>
  z
    .string()
    .trim()
    .min(1, mensaje)
    .max(max, mensaje)
    .refine((v) => !SIN_CONTROL.test(v), mensaje);

/** «60», «60,5», «1.234,56 €» → céntimos; vacío o fuera de 1..99 999 999 → error. */
const precio = z.string().transform((v, ctx) => {
  let centimos: number;
  try {
    centimos = aCentimos(v);
  } catch {
    ctx.addIssue({ code: 'custom', message: t('facturacion.borrador.errores.precio') });
    return z.NEVER;
  }
  if (centimos < 1 || centimos > MAX_PRECIO_CENTIMOS) {
    ctx.addIssue({ code: 'custom', message: t('facturacion.borrador.errores.precio') });
    return z.NEVER;
  }
  return centimos;
});

const cantidad = z.string().transform((v, ctx) => {
  const limpio = v.trim();
  if (!/^\d{1,3}$/.test(limpio)) {
    ctx.addIssue({ code: 'custom', message: t('facturacion.borrador.errores.cantidad') });
    return z.NEVER;
  }
  const n = Number.parseInt(limpio, 10);
  if (n < 1 || n > MAX_CANTIDAD) {
    ctx.addIssue({ code: 'custom', message: t('facturacion.borrador.errores.cantidad') });
    return z.NEVER;
  }
  return n;
});

/** Sin valor por defecto (ADR-053 j): el vacío es un error, nunca «exento». */
const regimen = z
  .string()
  .refine((v) => v === 'exento_sanitario' || v === 'general', t('facturacion.borrador.errores.regimen'))
  .transform((v) => v as 'exento_sanitario' | 'general');

export const esquemaLineaFormulario = z.object({
  cita_id: z.uuid().nullable(),
  concepto: texto(MAX_CONCEPTO, t('facturacion.borrador.errores.concepto')),
  cantidad,
  precio,
  regimen_iva: regimen,
});

const esquemaDestinatarioFormulario = z
  .object({
    modo: z.enum(['paciente', 'conservar', 'tercero']),
    nombre: z.string(),
    tipo: z.enum(['fisica', 'juridica']),
    nif: z.string(),
  })
  .superRefine((d, ctx) => {
    if (d.modo !== 'tercero') return;
    const nombre = d.nombre.trim();
    if (nombre.length === 0 || nombre.length > MAX_NOMBRE || SIN_CONTROL.test(nombre)) {
      ctx.addIssue({ code: 'custom', path: ['nombre'], message: t('facturacion.borrador.errores.nombre') });
    }
    const nif = d.nif.trim();
    if (nif !== '' && !(d.tipo === 'fisica' ? validarNif(nif) : validarCif(nif))) {
      ctx.addIssue({ code: 'custom', path: ['nif'], message: t('facturacion.borrador.errores.nif') });
    }
  })
  .transform((d) => {
    if (d.modo !== 'tercero') return { modo: d.modo };
    const nif = d.nif.trim();
    return {
      modo: 'tercero' as const,
      nombre: d.nombre.trim(),
      tipo: d.tipo,
      nif: nif === '' ? null : d.tipo === 'fisica' ? esquemaNif.parse(nif) : esquemaCif.parse(nif),
    };
  });

export const esquemaBorrador = z
  .object({
    pacienteId: z.uuid(),
    borradorId: z.uuid().nullable(),
    partida: z.number().int().min(1).nullable(),
    destinatario: esquemaDestinatarioFormulario,
    lineas: z
      .array(esquemaLineaFormulario)
      .min(1, t('facturacion.borrador.errores.sinLineas'))
      .max(MAX_LINEAS, t('facturacion.borrador.errores.sinLineas')),
  })
  .transform((d) => ({
    pacienteId: d.pacienteId,
    borradorId: d.borradorId,
    partida: d.partida,
    descartar: false as const,
    destinatario: d.destinatario as
      | { modo: 'paciente' }
      | { modo: 'conservar' }
      | { modo: 'tercero'; nombre: string; tipo: 'fisica' | 'juridica'; nif: string | null },
    lineas: d.lineas.map((l) => ({
      cita_id: l.cita_id,
      concepto: l.concepto,
      cantidad: l.cantidad,
      precio_centimos: l.precio,
      regimen_iva: l.regimen_iva,
    })),
  }));

export type ValoresBorrador = z.input<typeof esquemaBorrador>;
export type EntradaDelFormulario = z.output<typeof esquemaBorrador>;

/** Descartar no lleva líneas ni destinatario: la versión conserva los de la anterior. */
export const esquemaDescartar = z
  .object({ pacienteId: z.uuid(), borradorId: z.uuid(), partida: z.number().int().min(1) })
  .transform((d) => ({
    ...d,
    descartar: true as const,
    destinatario: { modo: 'conservar' as const },
    lineas: [],
  }));
