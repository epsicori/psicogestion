import { z } from 'zod';

import {
  CONTRASENA_MAX,
  CONTRASENA_MIN,
  MOTIVOS,
  REFERENCIA_MAX,
  REFERENCIA_MIN,
} from '@/lib/exportaciones/constantes';
import { t } from '@/lib/i18n';

/**
 * T-040 · Los esquemas de la copia de una nota. Sin `'use server'`: el diálogo importa los mismos
 * que validan las acciones.
 *
 * Los de las acciones son `strictObject` **a propósito**: si el cliente mandara la contraseña a
 * una acción, la entrada se rechaza en vez de ignorarse en silencio. La contraseña solo existe en
 * `esquemaDialogoCopia`, que no sale del navegador.
 */

/** Lo que recibe `pedirCopiaDeNota`. Sin motivo es la copia del profesional (§1.4). */
export const esquemaPedirCopia = z
  .strictObject({
    pacienteId: z.uuid(),
    notaId: z.uuid(),
    motivo: z.enum(MOTIVOS).nullable(),
    referencia: z.string().trim().min(REFERENCIA_MIN).max(REFERENCIA_MAX).nullable(),
  })
  .refine((e) => (e.motivo === null) === (e.referencia === null), { path: ['referencia'] });

/** Lo que recibe `registrarFicheroDeCopia`: la huella SHA-256 del fichero, nada del contenido. */
export const esquemaRegistrarFichero = z.strictObject({
  pacienteId: z.uuid(),
  exportacionId: z.uuid(),
  huellaHex: z.string().regex(/^[0-9a-f]{64}$/),
});

/** En caracteres (puntos de código) tras NFC, como `cifrarCopia` (ADR-076 §7). */
const caracteres = (s: string) => [...s.normalize('NFC')].length;

/**
 * El formulario del diálogo (solo cliente). La referencia es una cadena porque así la da el
 * campo de texto; vacía equivale a «sin referencia». Al enviar, el diálogo la convierte en `null`.
 */
export const esquemaDialogoCopia = z
  .object({
    motivo: z.enum(MOTIVOS).nullable(),
    referencia: z.string(),
    contrasena: z.string(),
    repeticion: z.string(),
    entendido: z.literal(true, { error: t('exportaciones.validacion.entendido') }),
  })
  .refine(
    (d) => {
      const referencia = d.referencia.trim();
      if (d.motivo === null) return referencia === '';
      return referencia.length >= REFERENCIA_MIN && referencia.length <= REFERENCIA_MAX;
    },
    { path: ['referencia'], message: t('exportaciones.validacion.referencia') },
  )
  .refine(
    (d) => caracteres(d.contrasena) >= CONTRASENA_MIN && caracteres(d.contrasena) <= CONTRASENA_MAX,
    { path: ['contrasena'], message: t('exportaciones.validacion.contrasena') },
  )
  .refine((d) => d.contrasena.normalize('NFC') === d.repeticion.normalize('NFC'), {
    path: ['repeticion'],
    message: t('exportaciones.validacion.noCoinciden'),
  });

export type ValoresDialogoCopia = z.input<typeof esquemaDialogoCopia>;

/** En modo «motivo» (la administración), el motivo es obligatorio. */
export const esquemaDialogoCopiaPorMotivo = esquemaDialogoCopia.refine((d) => d.motivo !== null, {
  path: ['motivo'],
  message: t('exportaciones.validacion.faltaMotivo'),
});
