import { format } from 'date-fns';
import { es as localeEs } from 'date-fns/locale';
import { TZDate, tz } from '@date-fns/tz';

import type { PrevisualizacionSerie } from '@/lib/citas/previsualizar';
import { formatearFechaLarga, formatearHora } from '@/lib/fechas/formato';
import { t, tCon } from '@/lib/i18n';

export type DescripcionSerie = { ahora: string; despues: string; alcance: string; avisos: string[] };

type Regla = PrevisualizacionSerie['reglaAnterior'] & Partial<Pick<PrevisualizacionSerie['regla'], 'ordinal' | 'ultimo'>>;

// Indexar, no calcular: la base da `diaSemana` ISO (1-7) y `ordinal` (1-5).
const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;
const ORDINALES = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto'] as const;

const lista = new Intl.ListFormat('es', { style: 'long', type: 'conjunction' });

/**
 * Una fecha `AAAA-MM-DD` anclada a las 12:00 en la zona: los saltos de hora caen de madrugada,
 * así que el día de calendario que entra es el que sale.
 */
function alMediodia(fecha: string, zona: string): TZDate {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new TZDate(anio, mes - 1, dia, 12, 0, 0, zona);
}

/** «1 de octubre». */
export function fechaCorta(fecha: string, zona: string): string {
  return format(alMediodia(fecha, zona), "d 'de' MMMM", { in: tz(zona), locale: localeEs });
}

/** «jueves, 1 de octubre de 2026». */
export function fechaLarga(fecha: string, zona: string): string {
  return formatearFechaLarga(alMediodia(fecha, zona), zona);
}

function frase(regla: Regla): string {
  const dia = DIAS[regla.diaSemana - 1];
  const hora = regla.horaLocal;
  if (regla.periodicidad !== 'mensual') {
    return tCon(`agenda.regla.${regla.periodicidad}`, { dias: t(`agenda.regla.diasPlural.${dia}`), hora });
  }
  const singular = t(`agenda.regla.dias.${dia}`);
  if (regla.ultimo) return tCon('agenda.regla.mensualUltimo', { dia: singular, hora });
  // La regla anterior no trae ordinal: la interfaz no lo deduce de ninguna fecha.
  if (regla.ordinal === null || regla.ordinal === undefined) {
    return tCon('agenda.regla.mensualSinOrdinal', { dia: singular, hora });
  }
  return tCon('agenda.regla.mensual', {
    ordinal: t(`agenda.regla.ordinales.${ORDINALES[regla.ordinal - 1]}`),
    dia: singular,
    hora,
  });
}

/**
 * Lo que el diálogo cuenta de una previsualización (T-014 §8.2). Solo formatea lo que trae la
 * base: el día, el ordinal, «último», las fechas y las horas salen de `previa`; aquí no se
 * calcula ninguno. La usa solo la acción del servidor; al cliente bajan cadenas.
 */
export function describirPrevisualizacion(previa: PrevisualizacionSerie): DescripcionSerie {
  const { regla, citas } = previa;
  const zona = regla.zonaHoraria;

  let alcance = '';
  if (citas.length === 1) {
    alcance = tCon('agenda.moverSerie.afecta.una', { primera: fechaCorta(citas[0].fechaNueva, zona) });
  } else if (citas.length > 1) {
    alcance = tCon('agenda.moverSerie.afecta.varias', {
      n: citas.length,
      primera: fechaCorta(citas[0].fechaNueva, zona),
      ultima: fechaCorta(citas[citas.length - 1].fechaNueva, zona),
    });
  }

  const avisos: string[] = [];

  const recortadas = citas.filter((c) => c.recortada);
  if (regla.recorte && recortadas.length > 0) {
    avisos.push(
      tCon('agenda.moverSerie.avisos.recorte', {
        dia: t(`agenda.regla.dias.${DIAS[regla.diaSemana - 1]}`),
        fechas: lista.format(recortadas.map((c) => fechaCorta(c.fechaNueva, zona))),
      }),
    );
  }

  for (const c of citas) {
    if (c.inicio === null) continue;
    if (c.clasificacion === 'inexistente') {
      avisos.push(
        tCon('agenda.moverSerie.avisos.inexistente', {
          fecha: fechaCorta(c.fechaNueva, zona),
          hora: regla.horaLocal,
          horaReal: formatearHora(new Date(c.inicio), zona),
        }),
      );
    } else if (c.clasificacion === 'ambigua') {
      avisos.push(
        tCon('agenda.moverSerie.avisos.ambigua', { fecha: fechaCorta(c.fechaNueva, zona), hora: regla.horaLocal }),
      );
    }
  }

  const sinHora = citas.filter((c) => c.inicio === null).length;
  if (sinHora === 1) avisos.push(t('agenda.moverSerie.avisos.sinHora.una'));
  if (sinHora > 1) avisos.push(tCon('agenda.moverSerie.avisos.sinHora.varias', { n: sinHora }));

  return {
    ahora: tCon('agenda.moverSerie.ahora', { regla: frase(previa.reglaAnterior) }),
    despues: tCon('agenda.moverSerie.despues', { regla: frase(regla) }),
    alcance,
    avisos,
  };
}
