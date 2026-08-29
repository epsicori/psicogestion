import { z } from 'zod';

import { t } from '@/lib/i18n';

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
});

export type DatosNuevoPaciente = z.infer<typeof esquemaNuevoPaciente>;
