import { z } from 'zod';

import { t } from '@/lib/i18n';

export const esquemaInicioSesion = z.object({
  correo: z.email({ error: t('acceso.introduceUnCorreoValido') }),
  contrasena: z
    .string({ error: t('acceso.introduceTuContrasena') })
    .min(1, { error: t('acceso.introduceTuContrasena') })
    .max(120, { error: t('acceso.laContrasenaEsDemasiadoLarga') }),
});

export type DatosInicioSesion = z.infer<typeof esquemaInicioSesion>;
