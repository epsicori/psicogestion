// T-046 · El contrato del núcleo `guardarBorrador` (diseño §1.4): lo que entra, lo que sale y el
// esquema con el que el núcleo vuelve a validar lo que la acción ya validó. Sin `server-only`: el
// editor importa los tipos del resultado para pintar los errores.
import { z } from 'zod';

import { validarCif } from '@/lib/identidad/cif';
import { validarNif } from '@/lib/identidad/nif';
import { esquemaCif, esquemaNif } from '@/lib/identidad/esquemas';

export const MAX_LINEAS = 50;
export const MAX_CONCEPTO = 200;
export const MAX_NOMBRE = 200;
export const MAX_CANTIDAD = 999;
export const MAX_PRECIO_CENTIMOS = 99_999_999;

/** Un texto de una línea: recortado, sin saltos y sin caracteres de control. */
export function textoDeUnaLinea(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v));
}

const esquemaLinea = z.object({
  cita_id: z.uuid().nullable(),
  concepto: textoDeUnaLinea(MAX_CONCEPTO),
  cantidad: z.number().int().min(1).max(MAX_CANTIDAD),
  precio_centimos: z.number().int().min(1).max(MAX_PRECIO_CENTIMOS),
  regimen_iva: z.enum(['exento_sanitario', 'general']),
});

const esquemaDestinatario = z.discriminatedUnion('modo', [
  z.object({ modo: z.literal('paciente') }),
  z.object({ modo: z.literal('conservar') }),
  z
    .object({
      modo: z.literal('tercero'),
      nombre: textoDeUnaLinea(MAX_NOMBRE),
      tipo: z.enum(['fisica', 'juridica']),
      nif: z.string().nullable(),
    })
    .superRefine((d, ctx) => {
      if (d.nif === null) return;
      const valido = d.tipo === 'fisica' ? validarNif(d.nif) : validarCif(d.nif);
      if (!valido) ctx.addIssue({ code: 'custom', path: ['nif'], message: 'NIF no válido' });
    })
    .transform((d) => ({
      ...d,
      nif: d.nif === null ? null : d.tipo === 'fisica' ? esquemaNif.parse(d.nif) : esquemaCif.parse(d.nif),
    })),
]);

export const esquemaEntradaGuardar = z
  .object({
    pacienteId: z.uuid(),
    borradorId: z.uuid().nullable(),
    partida: z.number().int().min(1).nullable(),
    descartar: z.boolean(),
    destinatario: esquemaDestinatario,
    lineas: z.array(esquemaLinea).min(1).max(MAX_LINEAS),
  })
  .superRefine((e, ctx) => {
    const crear = e.borradorId === null;
    if (crear && e.partida !== null) ctx.addIssue({ code: 'custom', path: ['partida'], message: 'sobra' });
    if (!crear && e.partida === null) ctx.addIssue({ code: 'custom', path: ['partida'], message: 'falta' });
    if (crear && e.descartar) ctx.addIssue({ code: 'custom', path: ['descartar'], message: 'nada que descartar' });
    // «Conservar» solo existe si hay una versión anterior de la que conservar.
    if (crear && e.destinatario.modo === 'conservar') {
      ctx.addIssue({ code: 'custom', path: ['destinatario'], message: 'nada que conservar' });
    }
  });

export type EntradaGuardar = z.output<typeof esquemaEntradaGuardar>;

export type ErrorGuardar =
  | 'no_disponible'
  | 'conflicto'
  | 'congelado'
  | 'descartado'
  | 'cita_no_elegible'
  | 'cita_en_otro_borrador'
  | 'cuota_minima'
  | 'validacion'
  | 'no_guardado';

export type ResultadoGuardar =
  | { ok: true; borradorId: string; numeroVersion: number }
  | { ok: false; error: ErrorGuardar; programa?: string; citas?: string[] };
