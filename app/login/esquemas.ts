import { z } from 'zod';

export const esquemaInicioSesion = z.object({
  correo: z.email({ error: 'Introduce un correo válido' }),
  contrasena: z
    .string({ error: 'Introduce tu contraseña' })
    .min(1, { error: 'Introduce tu contraseña' })
    .max(120, { error: 'La contraseña es demasiado larga' }),
});

export type DatosInicioSesion = z.infer<typeof esquemaInicioSesion>;
