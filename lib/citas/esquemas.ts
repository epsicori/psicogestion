// Esquemas Zod de lib/citas/. Mensajes de servidor, en castellano, literales:
// esta carpeta NO importa lib/i18n/ (mismo patrón que lib/huella/ y
// lib/cuentas/). Son el mismo esquema que usará el formulario en cliente de
// T-014 (el diálogo de serie; T-011b no tiene formulario): la convención del
// proyecto ("Mutaciones vía Server Actions, validadas con el mismo esquema
// Zod que usa el formulario").
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

/**
 * ¿Es una fecha de calendario que existe de verdad? `FECHA_ISO` solo mira la
 * forma (AAAA-MM-DD); un 30 de febrero pasa esa forma y `Date.UTC` lo
 * normaliza en silencio al 2 de marzo. Se comprueba con una ida y vuelta:
 * si al reconstruir la fecha desde sus tres números no coincide con lo que
 * se pidió, es que no existía. Deliberadamente NO importa de `lib/fechas/`
 * (mismo patrón que el resto de este fichero, ver cabecera).
 */
function esFechaReal(valor: string): boolean {
  const coincidencia = FECHA_ISO.exec(valor);
  if (!coincidencia) return false;
  const anio = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(5, 7));
  const dia = Number(valor.slice(8, 10));
  const instante = Date.UTC(anio, mes - 1, dia);
  const reconstruida = new Date(instante);
  return (
    reconstruida.getUTCFullYear() === anio &&
    reconstruida.getUTCMonth() === mes - 1 &&
    reconstruida.getUTCDate() === dia
  );
}

/** ISODOW (1 = lunes … 7 = domingo) de una fecha AAAA-MM-DD ya validada. */
function isodowDe(valor: string): number {
  const anio = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(5, 7));
  const dia = Number(valor.slice(8, 10));
  // getUTCDay(): 0 = domingo … 6 = sábado. ISODOW: 1 = lunes … 7 = domingo.
  const diaSemanaJS = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return diaSemanaJS === 0 ? 7 : diaSemanaJS;
}

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
 * duración, zona) y NADA de lo anterior — no mueve ninguna cita directamente.
 * `fecha` (T-011b, `p_fecha` de `agenda_editar_serie`) es la fecha nueva de
 * la cita ancla: solo tiene sentido con `esta_y_siguientes`, y si viene junto
 * con `diaSemana` los dos deben señalar el mismo día de la semana — si no,
 * la base los recibiría contradictorios y los rechazaría con menos contexto
 * que aquí.
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
    fecha: z
      .string()
      .regex(FECHA_ISO, 'La fecha debe tener forma AAAA-MM-DD.')
      .refine(esFechaReal, 'La fecha no existe en el calendario.')
      .nullable()
      .optional(),
  })
  .refine(
    (datos) =>
      datos.alcance !== 'esta' ||
      (datos.diaSemana == null &&
        datos.horaLocal == null &&
        datos.duracionMinutos == null &&
        datos.zonaHoraria == null &&
        datos.fecha == null),
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
  )
  .refine((datos) => datos.fecha == null || datos.diaSemana == null || isodowDe(datos.fecha) === datos.diaSemana, {
    message: 'La fecha y el día de la semana no coinciden.',
    path: ['fecha'],
  });

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

/**
 * El destino de una cita que se mueve en la agenda (T-014): día y hora de
 * pared en la zona de la VISTA, que la acción comprueba que es la del centro.
 * Separado de `esquemaReprogramarCita` porque la previsualización lo usa sin
 * `alcance` ni `firma`, y en Zod 4 un objeto con `refine` no admite `omit`.
 */
export const esquemaDestinoCita = z.object({
  citaId: z.uuid('Cita no válida.'),
  fecha: z
    .string('Introduce el día.')
    .regex(FECHA_ISO, 'La fecha debe tener forma AAAA-MM-DD.')
    .refine(esFechaReal, 'Ese día no existe.'),
  hora: z.string('Introduce la hora.').regex(HHMM, 'La hora debe tener forma HH:MM.'),
  zona: z.string().min(1, 'Falta la zona horaria de la vista.'),
});

export type DatosDestinoCita = z.infer<typeof esquemaDestinoCita>;

/**
 * Mover una cita desde la agenda. `alcance` es opcional en el esquema porque
 * una cita suelta no lo lleva; que una de serie lo traiga lo comprueba la
 * acción, que sabe si la cita es de serie. `firma` es la de la
 * previsualización que el usuario vio (§8.4 del diseño de T-014): con
 * `esta_y_siguientes` es obligatoria, y si la regla ya no es la que se
 * enseñó, la acción no edita.
 */
export const esquemaReprogramarCita = esquemaDestinoCita
  .extend({
    alcance: esquemaAlcance.optional(),
    firma: z
      .string()
      .regex(/^[0-9a-f]{64}$/, 'La previsualización no es válida.')
      .optional(),
  })
  .refine((datos) => datos.alcance !== 'esta_y_siguientes' || datos.firma !== undefined, {
    message: 'Falta la previsualización del cambio de la serie.',
    path: ['firma'],
  });

export type DatosReprogramarCita = z.infer<typeof esquemaReprogramarCita>;

/** `suelta` es una cita sola; las demás son series (T-028). */
export const PERIODICIDADES_ALTA = ['suelta', ...PERIODICIDADES] as const;

const FIRMA = /^[0-9a-f]{64}$/;

const FECHA_REAL = z
  .string('Introduce el día.')
  .regex(FECHA_ISO, 'La fecha debe tener forma AAAA-MM-DD.')
  .refine(esFechaReal, 'Ese día no existe.');

/**
 * El alta de una cita o de una serie (T-028). Es el mismo esquema en el formulario y en la
 * acción. No lleva duración: la fija el tipo de terapia y la lee el servidor del catálogo
 * (ADR-074); si el cliente la manda, `z.object` la descarta. El tipo es obligatorio para
 * todos los roles. Sin modalidad (ADR-075).
 */
export const esquemaAltaCita = z
  .object({
    pacienteId: z.uuid('Elige un paciente.'),
    profesionalId: z.uuid('Selecciona un profesional válido.'),
    centroId: z.uuid('Selecciona un centro válido.'),
    tipoTerapiaId: z.uuid('Elige un tipo de terapia.'),
    fecha: FECHA_REAL,
    horaLocal: z.string('Introduce la hora.').regex(HHMM, 'La hora debe tener forma HH:MM.'),
    periodicidad: z.enum(PERIODICIDADES_ALTA, 'Elige la periodicidad.'),
    sesionesTotales: z
      .int('El número de sesiones debe ser un entero.')
      .min(2, 'Una serie tiene entre 2 y 52 sesiones.')
      .max(52, 'Una serie tiene entre 2 y 52 sesiones.')
      .nullable(),
    sala: z.string().trim().max(200, 'El nombre de la sala es demasiado largo.').nullable(),
    notaOperativa: z.string().trim().max(500, 'La nota es demasiado larga.').nullable(),
    excluir: z.array(FECHA_REAL).max(52, 'Hay demasiadas fechas excluidas.'),
    aceptarAlternativas: z.array(FECHA_REAL).max(52, 'Hay demasiadas alternativas aceptadas.'),
    firma: z.string().regex(FIRMA, 'La previsualización no es válida.').nullable(),
  })
  .superRefine((datos, contexto) => {
    if (datos.periodicidad === 'suelta') {
      if (datos.sesionesTotales !== null) {
        contexto.addIssue({ code: 'custom', message: 'Una cita suelta no tiene número de sesiones.', path: ['sesionesTotales'] });
      }
      if (datos.firma !== null) {
        contexto.addIssue({ code: 'custom', message: 'Una cita suelta no lleva previsualización.', path: ['firma'] });
      }
    } else {
      if (datos.sesionesTotales === null) {
        contexto.addIssue({ code: 'custom', message: 'Indica cuántas sesiones tiene la serie.', path: ['sesionesTotales'] });
      }
      if (datos.firma === null) {
        contexto.addIssue({ code: 'custom', message: 'Falta la previsualización de la serie.', path: ['firma'] });
      }
    }
    if (datos.excluir.some((f) => datos.aceptarAlternativas.includes(f))) {
      contexto.addIssue({
        code: 'custom',
        message: 'Una fecha no puede quedar fuera y aceptar a la vez su alternativa.',
        path: ['aceptarAlternativas'],
      });
    }
  });

export type DatosAltaCita = z.infer<typeof esquemaAltaCita>;
