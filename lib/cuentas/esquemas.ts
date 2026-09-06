// Esquemas Zod de lib/cuentas/. Mensajes de servidor, en castellano, literales: esta
// carpeta NO importa lib/i18n/ (mismo patrón que lib/huella/ en T-005).
import { z } from 'zod';

export const ROLES_USUARIO = [
  'administrador',
  'profesional_sanitario',
  'tecnico_administrativo',
] as const;

export const esquemaInvitacion = z
  .object({
    correo: z.email('Introduce un correo válido.'),
    nombreCompleto: z
      .string('Introduce el nombre completo.')
      .trim()
      .min(1, 'Introduce el nombre completo.')
      .max(200, 'El nombre es demasiado largo.'),
    rol: z.enum(ROLES_USUARIO, 'Selecciona un rol válido.'),
    // Nulo salvo para el técnico administrativo, que lo exige tanto aquí como en la
    // base (ADR-033, perfiles_tecnico_exige_centro y preparar_invitacion()).
    centroId: z.uuid('Selecciona un centro válido.').nullable(),
  })
  .refine((datos) => datos.rol !== 'tecnico_administrativo' || datos.centroId !== null, {
    message: 'El técnico administrativo exige un centro.',
    path: ['centroId'],
  });

export type DatosInvitacion = z.infer<typeof esquemaInvitacion>;

export const esquemaPin = z.object({
  pin: z.string('Introduce el PIN.').regex(/^\d{6}$/, 'El PIN debe ser exactamente seis dígitos.'),
});

export type DatosPin = z.infer<typeof esquemaPin>;

export const esquemaBaja = z.object({
  perfilId: z.uuid('Perfil no válido.'),
  motivo: z
    .string()
    .trim()
    .max(500, 'El motivo es demasiado largo.')
    .optional()
    .transform((valor) => (valor && valor.length > 0 ? valor : null)),
});

export type DatosBaja = z.infer<typeof esquemaBaja>;

export const esquemaCodigoRecuperacion = z.object({
  codigo: z
    .string('Introduce el código de recuperación.')
    .trim()
    .min(1, 'Introduce el código de recuperación.')
    .max(64, 'El código no es válido.'),
});

export type DatosCodigoRecuperacion = z.infer<typeof esquemaCodigoRecuperacion>;
