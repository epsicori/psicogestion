import { format } from 'date-fns';
import { es as localeEs } from 'date-fns/locale';
import { TZDate, tz } from '@date-fns/tz';

import type { ResultadoSugerencias } from '@/lib/agenda/sugerencias';
import type { BloqueAlta, PrevisualizacionAlta } from '@/lib/citas/alta';
import { diaDeLaSemana, sumarDias } from '@/lib/fechas/calendario';
import { formatearFechaLarga, formatearHora, formatearRango } from '@/lib/fechas/formato';
import { t, tCon } from '@/lib/i18n';

import { textoMotivo } from './motivo';

/**
 * Lo que el calendario de selección y las tarjetas pintan, ya escrito (ADR-034): solo cadenas y
 * números. Va en servidor: aquí se usan instantes, y un `Date` en el cliente rompe la hidratación.
 */

export type HuecoVista = {
  /** `AAAA-MM-DDTHH:MM`, hora local: identifica el hueco ante el servidor. */
  clave: string;
  fecha: string;
  horaLocal: string;
  diaIndice: number;
  minutoPared: number;
  duracionMinutos: number;
  estado: 'libre' | 'ocupado';
  sugerida: 1 | 2 | 3 | null;
  habitual: boolean;
  /** «martes, 6 de octubre de 2026, 17:00, libre, sugerida»: lo que oye un lector de pantalla. */
  etiqueta: string;
  rango: string;
};

export type DiaAlta = {
  fecha: string;
  numero: string;
  etiquetaCorta: string;
  etiquetaLarga: string;
  esHoy: boolean;
  delMes: boolean;
};

export type CalendarioAlta = {
  desde: string;
  anterior: string;
  siguiente: string;
  titulo: string;
  dias: DiaAlta[];
  eje: { desdeMinuto: number; hastaMinuto: number; horas: string[] };
  huecos: HuecoVista[];
};

export type TarjetaVista = { clave: string; fecha: string; hora: string; motivo: string };

const EJE_DESDE = 7 * 60;
const EJE_HASTA = 21 * 60;

function alMediodia(fecha: string, zona: string): TZDate {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new TZDate(anio, mes - 1, dia, 12, 0, 0, zona);
}

function formatear(instante: Date, patron: string, zona: string): string {
  return format(instante, patron, { in: tz(zona), locale: localeEs });
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function hora(minuto: number): string {
  return `${String(Math.floor(minuto / 60)).padStart(2, '0')}:00`;
}

/** El lunes de la semana de una fecha de calendario: la semana empieza en lunes. */
export function lunesDe(fecha: string): string {
  return sumarDias(fecha, 1 - diaDeLaSemana(fecha));
}

/**
 * Los siete días desde el lunes de `fechaFoco`, los huecos de esos días con su posición en el
 * eje, y qué huecos son sugeridos o del día y hora habituales. Un bloque fuera de la semana no
 * se pinta. Ningún hueco enseña el tipo de terapia: los bloques no lo llevan.
 */
export function construirCalendarioAlta(entrada: {
  fechaFoco: string;
  zona: string;
  hoy: string;
  bloques: BloqueAlta[];
  sugerencias: ResultadoSugerencias;
}): CalendarioAlta {
  const { zona, hoy } = entrada;
  const desde = lunesDe(entrada.fechaFoco);

  const dias: DiaAlta[] = Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(desde, i);
    const instante = alMediodia(fecha, zona);
    return {
      fecha,
      numero: String(Number(fecha.slice(8))),
      etiquetaCorta: formatear(instante, 'EEE', zona),
      etiquetaLarga: formatearFechaLarga(instante, zona),
      esHoy: fecha === hoy,
      delMes: true,
    };
  });
  const indice = new Map(dias.map((d, i) => [d.fecha, i]));

  const sugeridas = new Map(entrada.sugerencias.sugerencias.map((s, i) => [`${s.fecha}T${s.horaLocal}`, i + 1]));
  const habituales = entrada.sugerencias.sugerencias.flatMap((s) =>
    s.motivo.tipo === 'diaHabitual' ? [{ diaSemana: s.motivo.diaSemana, hora: s.motivo.hora }] : [],
  );

  // H34: la base emite un `ocupado` como [cursor, cursor + duración pedida) y salta el cursor al final de la
  // cita real; si ésta es más corta, el tramo siguiente empieza dentro del ocupado pintado. Un ocupado acaba,
  // como mucho, donde empieza el siguiente tramo del mismo día (la base no se toca, y no se revela nada más).
  const finDeOcupado = (b: BloqueAlta): string => {
    const inicio = Date.parse(b.inicio);
    const siguiente = entrada.bloques
      .filter((o) => o.fecha === b.fecha && Date.parse(o.inicio) > inicio)
      .reduce<number | null>((min, o) => {
        const i = Date.parse(o.inicio);
        return min === null || i < min ? i : min;
      }, null);
    return siguiente !== null && siguiente < Date.parse(b.fin) ? new Date(siguiente).toISOString() : b.fin;
  };

  const huecos: HuecoVista[] = entrada.bloques.flatMap((b) => {
    const fin = b.estado === 'ocupado' ? finDeOcupado(b) : b.fin;
    const diaIndice = indice.get(b.fecha);
    if (diaIndice === undefined) return [];
    const numeroSugerida = sugeridas.get(`${b.fecha}T${b.horaLocal}`);
    const sugerida = numeroSugerida === 1 || numeroSugerida === 2 || numeroSugerida === 3 ? numeroSugerida : null;
    const habitual =
      b.estado === 'libre' &&
      habituales.some((h) => h.diaSemana === diaDeLaSemana(b.fecha) && h.hora === b.horaLocal);
    const cuando = `${dias[diaIndice].etiquetaLarga}, ${b.horaLocal}`;
    const partes = [
      b.estado === 'libre' ? tCon('agenda.alta.seleccion.libre', { cuando }) : `${cuando}, ${t('agenda.alta.seleccion.etiquetaOcupado')}`,
    ];
    if (b.estado === 'libre' && sugerida) partes.push(t('agenda.alta.seleccion.sugerida'));
    if (habitual) partes.push(t('agenda.alta.seleccion.habitual'));

    const [h, m] = b.horaLocal.split(':').map(Number);
    return [
      {
        clave: `${b.fecha}T${b.horaLocal}`,
        fecha: b.fecha,
        horaLocal: b.horaLocal,
        diaIndice,
        minutoPared: h * 60 + m,
        duracionMinutos: Math.round((Date.parse(fin) - Date.parse(b.inicio)) / 60_000),
        estado: b.estado,
        sugerida: b.estado === 'libre' ? sugerida : null,
        habitual,
        etiqueta: partes.join(', '),
        rango: formatearRango(new Date(b.inicio), new Date(fin), zona),
      },
    ];
  });

  let desdeMinuto = EJE_DESDE;
  let hastaMinuto = EJE_HASTA;
  for (const h of huecos) {
    desdeMinuto = Math.min(desdeMinuto, Math.floor(h.minutoPared / 60) * 60);
    hastaMinuto = Math.max(hastaMinuto, Math.ceil(Math.min(h.minutoPared + h.duracionMinutos, 24 * 60) / 60) * 60);
  }
  const horas: string[] = [];
  for (let m = desdeMinuto; m < hastaMinuto; m += 60) horas.push(hora(m));

  const primero = alMediodia(dias[0].fecha, zona);
  const ultimo = alMediodia(dias[6].fecha, zona);

  return {
    desde,
    anterior: sumarDias(desde, -7),
    siguiente: sumarDias(desde, 7),
    titulo: `${formatear(primero, 'd MMM', zona)} – ${formatear(ultimo, 'd MMM yyyy', zona)}`,
    dias,
    eje: { desdeMinuto, hastaMinuto, horas },
    huecos,
  };
}

export type SesionVista = {
  /** `AAAA-MM-DD` original de la sesión: la clave de «excluir» y «aceptar alternativa». */
  fecha: string;
  fechaLarga: string;
  hora: string | null;
  estado: 'normal' | 'festivo' | 'ausencia' | 'ocupada' | 'cambioDeHora';
  alternativa: string | null;
  horaResultante: string | null;
};

/**
 * Una fila por sesión de la serie, ya escrita. Un bloqueo no enseña hora; una hora inexistente o
 * ambigua es un cambio de hora y dice a cuál queda. Solo formatea lo que la base devolvió.
 */
export function presentarSerie(previa: PrevisualizacionAlta, zona: string): SesionVista[] {
  return previa.sesiones.map((s) => {
    const alternativa = s.alternativa
      ? `${formatearFechaLarga(new Date(s.alternativa.inicio), zona)}, ${formatearHora(new Date(s.alternativa.inicio), zona)}`
      : null;
    const cambio = !s.bloqueo && s.clasificacion !== 'normal';
    return {
      fecha: s.fecha,
      fechaLarga: mayuscula(formatearFechaLarga(alMediodia(s.fecha, zona), zona)),
      hora: s.bloqueo ? null : s.horaLocal,
      estado: s.bloqueo ?? (cambio ? 'cambioDeHora' : 'normal'),
      alternativa,
      horaResultante: cambio ? formatearHora(new Date(s.inicio), zona) : null,
    };
  });
}

/** Las tarjetas de sugerencia: fecha larga, hora y motivo escrito. Nunca el tipo ni una cifra de acierto. */
export function construirTarjetas(
  resultado: ResultadoSugerencias,
  zona: string,
): { modo: ResultadoSugerencias['modo']; tarjetas: TarjetaVista[] } {
  return {
    modo: resultado.modo,
    tarjetas: resultado.sugerencias.map((s) => ({
      clave: `${s.fecha}T${s.horaLocal}`,
      fecha: mayuscula(formatearFechaLarga(alMediodia(s.fecha, zona), zona)),
      hora: s.horaLocal,
      motivo: textoMotivo(s.motivo),
    })),
  };
}
