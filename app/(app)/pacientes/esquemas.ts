import { z } from 'zod';

export const esquemaNuevoPaciente = z.object({
  nombre: z
    .string({ error: 'Introduce el nombre' })
    .trim()
    .min(1, { error: 'Introduce el nombre' })
    .max(120, { error: 'El nombre es demasiado largo' }),
  apellidos: z
    .string({ error: 'Introduce los apellidos' })
    .trim()
    .min(1, { error: 'Introduce los apellidos' })
    .max(120, { error: 'Los apellidos son demasiado largos' }),
});

export type DatosNuevoPaciente = z.infer<typeof esquemaNuevoPaciente>;
