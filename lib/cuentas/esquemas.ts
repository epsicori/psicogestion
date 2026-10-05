// Esquemas Zod de lib/cuentas/. Mensajes de servidor, en castellano, literales: esta
// carpeta NO importa lib/i18n/ (mismo patrón que lib/huella/ en T-005).
import { z } from 'zod';

export const ROLES_USUARIO = [
  'administrador',
  'profesional_sanitario',
  'tecnico_administrativo',
] as const;

/** Tope de centros en una invitación (T-041): una cota razonable, no una política. */
export const MAX_CENTROS_DE_ALTA = 50;

export const esquemaInvitacion = z
  .object({
    correo: z.email('Introduce un correo válido.'),
    nombreCompleto: z
      .string('Introduce el nombre completo.')
      .trim()
      .min(1, 'Introduce el nombre completo.')
      .max(200, 'El nombre es demasiado largo.'),
    rol: z.enum(ROLES_USUARIO, 'Selecciona un rol válido.'),
    // T-041: los centros donde atiende. El técnico administrativo exige exactamente uno
    // (ADR-033, perfiles_tecnico_exige_centro y preparar_invitacion()); el profesional y el
    // administrador, cero o más.
    centrosIds: z
      .array(z.uuid('Selecciona un centro válido.'))
      .max(MAX_CENTROS_DE_ALTA, 'Demasiados centros.'),
    // El centro principal decide dónde quedan sus pacientes futuros; lo elige una persona,
    // nunca se toma en silencio el primero de la lista (diseño T-041 §5).
    centroPrincipalId: z.uuid('Selecciona un centro válido.').nullable(),
  })
  .refine(
    (datos) => datos.rol !== 'tecnico_administrativo' || datos.centrosIds.length === 1,
    { message: 'El técnico administrativo exige un centro.', path: ['centrosIds'] },
  )
  .refine((datos) => new Set(datos.centrosIds).size === datos.centrosIds.length, {
    message: 'Hay centros repetidos.',
    path: ['centrosIds'],
  })
  .refine(
    (datos) =>
      datos.centrosIds.length === 0
        ? datos.centroPrincipalId === null
        : datos.centroPrincipalId !== null && datos.centrosIds.includes(datos.centroPrincipalId),
    { message: 'Elige cuál es su centro principal', path: ['centroPrincipalId'] },
  );

export type DatosInvitacion = z.infer<typeof esquemaInvitacion>;

/** Dar o retirar un alta de centro (T-041). La RPC decide todo lo demás. */
export const esquemaAltaCentro = z.object({
  perfilId: z.uuid('Perfil no válido.'),
  centroId: z.uuid('Centro no válido.'),
});

export type EntradaAltaCentro = z.infer<typeof esquemaAltaCentro>;

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

/**
 * Regenerar los códigos de recuperación (T-038). La contraseña NO se recorta: los
 * espacios del borde forman parte de ella, y el límite de 256 es el de un campo
 * razonable, no una política. Los mensajes de error de Zod no incluyen el valor.
 */
export const esquemaRegenerarCodigos = z.object({
  contrasena: z
    .string('Introduce tu contraseña.')
    .min(1, 'Introduce tu contraseña.')
    .max(256, 'La contraseña no es válida.'),
  codigo: z
    .string('Introduce el código de tu app de autenticación.')
    .regex(/^\d{6}$/, 'El código debe ser exactamente seis dígitos.'),
});

export type DatosRegenerarCodigos = z.infer<typeof esquemaRegenerarCodigos>;
