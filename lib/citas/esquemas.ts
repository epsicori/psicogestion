// Esquemas Zod de lib/citas/. Mensajes de servidor, en castellano, literales:
// esta carpeta NO importa lib/i18n/ (mismo patrón que lib/huella/ y
// lib/cuentas/). Son el mismo esquema que usará el formulario en cliente de
// T-011b (MiniMax): la convención del proyecto ("Mutaciones vía Server
// Actions, validadas con el mismo esquema Zod que usa el formulario").
import { z } from 'zod';

/**
 * «¿Solo esta, o esta y las siguientes?» — EXACTAMENTE dos valores, igual que
 * `public.alcance_cambio_serie` en la base. Sin valor por defecto en ningún
 * sitio: la pregunta es obligatoria. «Todas» no existe.
 */
export const esquemaAlcance = z.enum(['esta', 'esta_y_siguientes']);
export type Alcance = z.infer<typeof esquemaAlcance>;

export const PERIODICIDADES = ['semanal', 'quincenal', 'mensual'] as const;
export const esquemaPeriodicidad = z.enum(PERIODICIDADES);

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export const esquemaCrearSerie = z
  .object({
    pacienteId: z.uuid('Selecciona un paciente válido.'),
    profesionalId: z.uuid('Selecciona un profesional válido.'),
    centroId: z.uuid('Selecciona un centro válido.').nullable(),
    tipoTerapiaId: z.uuid('Selecciona un tipo de terapia válido.').nullable(),
    periodicidad: esquemaPeriodicidad,
    diaSemana: z
      .int('El día de la semana debe ser un entero.')
      .min(1, 'El día de la semana va de 1 (lunes) a 7 (domingo), ISODOW.')
      .max(7, 'El día de la semana va de 1 (lunes) a 7 (domingo), ISODOW.'),
    horaLocal: z.string('Introduce la hora.').regex(HHMM, 'La hora debe tener forma HH:MM.'),
    duracionMinutos: z
      .int('La duración debe ser un entero.')
      .min(5, 'La duración mínima es de 5 minutos.')
      .max(480, 'La duración máxima es de 480 minutos.'),
    desde: z.string('Introduce la fecha de inicio.').regex(FECHA_ISO, 'La fecha debe tener forma AAAA-MM-DD.'),
    sesionesTotales: z
      .int('El número de sesiones debe ser un entero.')
      .positive('El número de sesiones debe ser mayor que cero.')
      .nullable(),
    finEl: z
      .string()
      .regex(FECHA_ISO, 'La fecha de fin debe tener forma AAAA-MM-DD.')
      .nullable(),
  })
  // Igual que series_cita_final_ck en la base: la serie termina por número de
  // sesiones O por fecha, no por las dos ni por ninguna.
  .refine((datos) => (datos.sesionesTotales !== null) !== (datos.finEl !== null), {
    message: 'Indica cuántas sesiones tiene la serie o cuándo termina, pero no las dos cosas ni ninguna.',
    path: ['sesionesTotales'],
  });

export type DatosCrearSerie = z.infer<typeof esquemaCrearSerie>;

export const esquemaCancelarCita = z.object({
  citaId: z.uuid('Cita no válida.'),
  alcance: esquemaAlcance,
  motivo: z
    .string()
    .trim()
    .max(500, 'El motivo es demasiado largo.')
    .optional()
    .transform((valor) => (valor && valor.length > 0 ? valor : null)),
});

export type DatosCancelarCita = z.infer<typeof esquemaCancelarCita>;

/**
 * `esta`: acepta lo mismo que `agenda_actualizar_cita()` de T-010 (estado,
 * sala, inicio, fin — nunca tipo_terapia_id ni nota_operativa, que el técnico
 * no debe ver). `esta_y_siguientes`: acepta la regla de la serie (día, hora,
 * duración, zona) y NADA de lo anterior — no mueve ninguna cita.
 */
export const esquemaEditarSerie = z
  .object({
    citaId: z.uuid('Cita no válida.'),
    alcance: esquemaAlcance,
    estado: z
      .enum(['programada', 'confirmada', 'realizada', 'cancelada', 'no_asistida'])
      .nullable()
      .optional(),
    sala: z.string().trim().max(200, 'El nombre de la sala es demasiado largo.').nullable().optional(),
    inicio: z.iso.datetime({ offset: true }).nullable().optional(),
    fin: z.iso.datetime({ offset: true }).nullable().optional(),
    diaSemana: z.int().min(1).max(7).nullable().optional(),
    horaLocal: z.string().regex(HHMM, 'La hora debe tener forma HH:MM.').nullable().optional(),
    duracionMinutos: z.int().min(5).max(480).nullable().optional(),
    zonaHoraria: z.string().min(1, 'Selecciona una zona horaria.').nullable().optional(),
  })
  .refine(
    (datos) =>
      datos.alcance !== 'esta' ||
      (datos.diaSemana == null && datos.horaLocal == null && datos.duracionMinutos == null && datos.zonaHoraria == null),
    {
      message: 'Con alcance "esta" no se cambia la regla de la serie.',
      path: ['alcance'],
    },
  )
  .refine(
    (datos) =>
      datos.alcance !== 'esta_y_siguientes' ||
      (datos.estado == null && datos.sala == null && datos.inicio == null && datos.fin == null),
    {
      message: 'Con alcance "esta_y_siguientes" no se mueve ninguna cita directamente.',
      path: ['alcance'],
    },
  );

export type DatosEditarSerie = z.infer<typeof esquemaEditarSerie>;

export const esquemaConfirmarPropuesta = z.object({
  propuestaId: z.uuid('Propuesta no válida.'),
});

export type DatosConfirmarPropuesta = z.infer<typeof esquemaConfirmarPropuesta>;

export const esquemaDescartarPropuesta = z.object({
  propuestaId: z.uuid('Propuesta no válida.'),
});

export type DatosDescartarPropuesta = z.infer<typeof esquemaDescartarPropuesta>;

export const esquemaDesplazarCita = z.object({
  citaId: z.uuid('Cita no válida.'),
  estado: z
    .enum(['programada', 'confirmada', 'realizada', 'cancelada', 'no_asistida'])
    .nullable()
    .optional(),
  sala: z.string().trim().max(200, 'El nombre de la sala es demasiado largo.').nullable().optional(),
  inicio: z.iso.datetime({ offset: true }).nullable().optional(),
  fin: z.iso.datetime({ offset: true }).nullable().optional(),
});

export type DatosDesplazarCita = z.infer<typeof esquemaDesplazarCita>;
