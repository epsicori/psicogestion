import { z } from 'zod';

import { SIN_NULO } from '@/lib/notas/cuerpo';

/**
 * Los esquemas de las acciones de la nota. Sin `'use server'`: el formulario de cliente importa
 * **el mismo** esquema que valida la acción. Cada uno se escribe entero (no `.omit()`/`.pick()`
 * sobre esquemas con `refine`).
 */

const texto = z.string().max(60_000).regex(SIN_NULO);
const reservadas = z.string().max(20_000).regex(SIN_NULO);

/** Cita XOR nota: se abre por una de las dos. */
export const esquemaApertura = z
  .object({
    pacienteId: z.uuid(),
    citaId: z.uuid().nullable(),
    notaId: z.uuid().nullable(),
    episodioId: z.uuid().nullable(),
  })
  .refine((e) => (e.citaId === null) !== (e.notaId === null));

/** `testigo` es una CADENA opaca: nunca pasa por `Date`. */
export const esquemaBorrador = z.object({
  pacienteId: z.uuid(),
  notaId: z.uuid(),
  testigo: z.string().min(1),
  texto,
  reservadas,
});

export const esquemaCoprofesional = z.object({
  pacienteId: z.uuid(),
  notaId: z.uuid(),
  coprofesionalId: z.uuid().nullable(),
});

export const esquemaModificar = z.object({
  pacienteId: z.uuid(),
  notaId: z.uuid(),
});

export const esquemaFirma = z.object({
  pacienteId: z.uuid(),
  notaId: z.uuid(),
  testigo: z.string().min(1),
  alcance: z.enum(['individual', 'conjunta']),
  motivo: z.string().trim().min(1).max(500).regex(SIN_NULO).nullable(),
});
