import 'server-only';

import { TZDate } from '@date-fns/tz';

import { formatearFechaCorta, formatearFechaLarga, formatearHora, formatearRango } from '../fechas/formato';
import type { PropuestaPendiente } from './propuestas';

/**
 * Formatea horas EN SERVIDOR, en la zona del centro, bajando como cadena
 * (§ notas del ticket T-011). Un instante crudo (`Date`/`timestamptz`) NUNCA
 * baja al navegador: el navegador está en la zona del usuario, no en la del
 * centro, y calcularlo en cliente reabre el problema de hidratación que
 * `lib/fechas/` ya resolvió con `@date-fns/tz`.
 */

export type CitaParaResumen = {
  id: string;
  inicio: Date;
  fin: Date;
  zonaHoraria: string;
  estado: string;
  desviada: boolean;
  motivoDesviacion: string | null;
};

export type ResumenCita = {
  id: string;
  fechaCorta: string;
  fechaLarga: string;
  rangoHorario: string;
  estado: string;
  desviada: boolean;
  motivoDesviacion: string | null;
};

/** Resume una cita ya materializada: fecha y rango horario formateados, nunca instantes crudos. */
export function resumirCita(cita: CitaParaResumen): ResumenCita {
  return {
    id: cita.id,
    fechaCorta: formatearFechaCorta(cita.inicio, cita.zonaHoraria),
    fechaLarga: formatearFechaLarga(cita.inicio, cita.zonaHoraria),
    rangoHorario: formatearRango(cita.inicio, cita.fin, cita.zonaHoraria),
    estado: cita.estado,
    desviada: cita.desviada,
    motivoDesviacion: cita.motivoDesviacion,
  };
}

export type ResumenPropuesta = {
  id: string;
  motivo: PropuestaPendiente['motivo'];
  fechaPrevistaCorta: string;
  horaLocalPrevista: string;
  /** null cuando la propuesta no trae un desplazamiento posible (§7): la decide una persona. */
  rangoPropuesto: string | null;
};

/**
 * Resume una propuesta pendiente. `fechaPrevista`/`horaLocalPrevista` son
 * `date`/`time` sin zona (lo previsto originalmente); si hay desplazamiento
 * (`inicioPropuesto`/`finPropuesto` no nulos) se formatea también el rango
 * concreto en la zona de la propuesta.
 */
export function resumirPropuesta(propuesta: PropuestaPendiente): ResumenPropuesta {
  const inicio = propuesta.inicioPropuesto ? new Date(propuesta.inicioPropuesto) : null;
  const fin = propuesta.finPropuesto ? new Date(propuesta.finPropuesto) : null;

  return {
    id: propuesta.id,
    motivo: propuesta.motivo,
    fechaPrevistaCorta: formatearFechaPrevista(propuesta.fechaPrevista, propuesta.zonaHoraria),
    horaLocalPrevista: propuesta.horaLocalPrevista.slice(0, 5),
    rangoPropuesto: inicio && fin ? formatearRango(inicio, fin, propuesta.zonaHoraria) : null,
  };
}

/**
 * `fecha_prevista` es un `date` de Postgres: un día de calendario, sin zona y
 * sin instante. Para darlo formateado como el resto —y no bajar una cadena ISO
 * cruda bajo un nombre que promete otra cosa (hallazgo 6 de la revisión con
 * Opus del 11-09-2026)— se ancla **al mediodía** de ese día en la zona de la
 * propuesta y se formatea con el mismo `formatearFechaCorta()` que las citas.
 *
 * El mediodía no es capricho: los saltos de horario de verano caen de
 * madrugada, así que a las 12:00 no hay hora inexistente ni ambigua en ninguna
 * zona, y el día de calendario que entra es exactamente el que sale.
 */
function formatearFechaPrevista(fechaIso: string, zona: string): string {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  return formatearFechaCorta(new TZDate(anio, mes - 1, dia, 12, 0, 0, zona), zona);
}

// formatearHora se reexporta para quien solo necesite una hora suelta (p.ej.
// confirmar un desplazamiento mostrando "16:00" sin fecha ni rango).
export { formatearHora };
