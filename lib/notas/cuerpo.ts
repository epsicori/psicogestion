// T-012 · La forma del cuerpo de una nota y de su borrador.
import { z } from 'zod';

/**
 * El cuerpo sellado: `{ texto }` y nada más (la forma de la siembra y de los vectores).
 * Sin discriminante de formato: lo que se firma es texto.
 */
export const esquemaCuerpo = z.object({ texto: z.string() }).strict();

/**
 * El borrador guardado en `notas_clinicas.borrador_contenido`. Tolerante al leer: el borrador
 * sembrado no lleva `reservadas`. Al escribir se mandan siempre las dos claves.
 */
export const esquemaBorrador = z.object({
  texto: z.string(),
  reservadas: z.string().default(''),
});

/** Sin U+0000: Postgres lo rechaza en `text` y `jsonb` (22P05). */
export const SIN_NULO = /^[^\u0000]*$/;
