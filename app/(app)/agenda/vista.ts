import { format } from 'date-fns';
import { es as localeEs } from 'date-fns/locale';
import { TZDate, tz } from '@date-fns/tz';

import type { EstadoVisibleCita } from '@/components/ui/estado-cita';
import { colocarEnRejilla } from '@/lib/agenda/rejilla';
import { diasDelMes } from '@/lib/agenda/mes';
import { estadoParaPunto, type FilaAgenda } from '@/lib/citas/agenda';
import { resumirPropuesta } from '@/lib/citas/presentacion';
import type { PropuestaPendiente } from '@/lib/citas/propuestas';
import { diasEntre, sumarDias, sumarMeses } from '@/lib/fechas/calendario';
import { formatearFechaLarga, formatearRango } from '@/lib/fechas/formato';
import { t, tCon } from '@/lib/i18n';

import { RUTA_NOTAS_DISPONIBLE, rutaNotas } from './notas';
import type { Vista } from './parametros';

export type EntradaVista = {
  filas: FilaAgenda[];
  propuestas: PropuestaPendiente[];
  vista: Vista;
  /** Ya resuelta: «hoy» lo calcula el llamante en la zona. */
  fecha: string;
  zona: string;
  hoy: string;
  ahora: Date;
  usuarioId: string;
  profesionalFiltrado: string | null;
};

export type DiaVista = {
  fecha: string;
  numero: string;
  etiquetaCorta: string;
  etiquetaLarga: string;
  esHoy: boolean;
  delMes: boolean;
};

export type CitaVista = {
  id: string;
  /** 0 para el primer tramo; 1 para el que sigue tras la medianoche. */
  tramo: number;
  pacienteId: string;
  diaIndice: number;
  /** Día y hora locales del inicio de la cita (no del tramo): lo que abre el diálogo. */
  fechaLocal: string;
  horaLocal: string;
  minutoPared: number;
  duracionMinutos: number;
  columna: number;
  columnasEnGrupo: number;
  rango: string;
  duracion: string;
  nombrePaciente: string;
  nombreCorto: string;
  profesionalNombre: string;
  colorProfesional: 1 | 2 | 3 | 4 | 5 | 6;
  tipoNombre: string | null;
  centroNombre: string | null;
  sala: string | null;
  notaOperativa: string | null;
  estado: EstadoVisibleCita;
  late: boolean;
  deSerie: boolean;
  desviada: boolean;
  /** Etiqueta ya traducida. */
  motivoDesviacion: string | null;
  reprogramable: boolean;
  alcanceSiguientesPermitido: boolean;
  propuestaPendiente: { id: string; rango: string | null } | null;
  notas: { mostrar: boolean; href: string; primario: boolean; diasPendiente: number | null };
};

/** Solo cadenas, números y booleanos: ningún `Date` cruza al cliente (ADR-034). */
export type VistaCalendario = {
  vista: Vista;
  zona: string;
  hoy: string;
  fechaFoco: string;
  anterior: string;
  siguiente: string;
  titulo: string;
  dias: DiaVista[];
  eje: { desdeMinuto: number; hastaMinuto: number; horas: string[] };
  citas: CitaVista[];
  profesionales: { id: string; nombre: string }[];
};

const EJE_DESDE = 7 * 60;
const EJE_HASTA = 21 * 60;
const MINUTOS_DIA = 24 * 60;

/**
 * El mediodía del día en la zona: los saltos de hora caen de madrugada, así que a las 12:00
 * el día de calendario que entra es el que sale (el mismo ancla que `presentacion.ts`).
 */
function alMediodia(fecha: string, zona: string): TZDate {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new TZDate(anio, mes - 1, dia, 12, 0, 0, zona);
}

function formatear(instante: Date, patron: string, zona: string): string {
  return format(instante, patron, { in: tz(zona), locale: localeEs });
}

function fechaLocal(instante: Date, zona: string): string {
  return formatear(instante, 'yyyy-MM-dd', zona);
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** FNV-1a de 32 bits: estable entre renderizados y entre servidor y cliente. */
function colorDe(uuid: string): CitaVista['colorProfesional'] {
  let h = 0x811c9dc5;
  for (let i = 0; i < uuid.length; i++) {
    h ^= uuid.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (1 + (h % 6)) as CitaVista['colorProfesional'];
}

function nombres(fila: FilaAgenda): { nombrePaciente: string; nombreCorto: string } {
  if (fila.pacienteNombre === null) {
    const paciente = t('agenda.cita.paciente');
    return { nombrePaciente: paciente, nombreCorto: paciente };
  }
  const apellidos = fila.pacienteApellidos?.trim() ?? '';
  const nombre = fila.pacienteNombre.trim();
  const primerNombre = nombre.split(/\s+/)[0];
  return {
    nombrePaciente: apellidos ? `${nombre} ${apellidos}` : nombre,
    nombreCorto: apellidos ? `${primerNombre} ${apellidos.charAt(0)}.` : primerNombre,
  };
}

function compararFilas(a: FilaAgenda, b: FilaAgenda): number {
  return a.inicio.getTime() - b.inicio.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function tituloSemana(desde: string, hasta: string, zona: string): string {
  const [d, h] = [alMediodia(desde, zona), alMediodia(hasta, zona)];
  const numero = (f: string) => String(Number(f.slice(8)));
  const mes = (i: Date) => formatear(i, 'MMMM', zona);
  if (desde.slice(0, 4) !== hasta.slice(0, 4)) {
    return tCon('agenda.tituloSemanaDosAnios', {
      desde: numero(desde),
      mesDesde: mes(d),
      anioDesde: desde.slice(0, 4),
      hasta: numero(hasta),
      mesHasta: mes(h),
      anioHasta: hasta.slice(0, 4),
    });
  }
  if (desde.slice(0, 7) !== hasta.slice(0, 7)) {
    return tCon('agenda.tituloSemanaDosMeses', {
      desde: numero(desde),
      mesDesde: mes(d),
      hasta: numero(hasta),
      mesHasta: mes(h),
      anio: hasta.slice(0, 4),
    });
  }
  return tCon('agenda.tituloSemana', {
    desde: numero(desde),
    hasta: numero(hasta),
    mes: mes(d),
    anio: desde.slice(0, 4),
  });
}

function hora(minuto: number): string {
  return `${String(Math.floor(minuto / 60)).padStart(2, '0')}:00`;
}

/**
 * La vista del calendario, pura (T-014 §1.6.2). Recibe las filas que la RLS ya dejó ver y
 * devuelve lo que la isla pinta, formateado en la zona del centro.
 */
export function construirVista(entrada: EntradaVista): VistaCalendario {
  const { vista, fecha, zona, hoy, usuarioId } = entrada;

  const profesionales = [
    ...new Map(entrada.filas.map((f) => [f.profesionalId, f.profesionalNombre ?? t('agenda.cita.profesional')])).entries(),
  ]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  // El filtro va antes de colocar: una cita quitada no reparte columnas ni se lleva el latido.
  const filas = (
    entrada.profesionalFiltrado === null
      ? entrada.filas
      : entrada.filas.filter((f) => f.profesionalId === entrada.profesionalFiltrado)
  )
    .slice()
    .sort(compararFilas);

  const idQueLate = filas.find((f) => f.enCurso)?.id ?? null;
  const propuestaDe = new Map(
    entrada.propuestas.filter((p) => p.citaId !== null).map((p) => [p.citaId as string, p]),
  );

  const diasBase =
    vista === 'semana'
      ? Array.from({ length: 7 }, (_, i) => ({
          fecha: sumarDias(fecha, 1 - diaSemana(fecha, zona) + i),
          delMes: true,
        }))
      : diasDelMes(fecha);

  const dias: DiaVista[] = diasBase.map((d) => {
    const instante = alMediodia(d.fecha, zona);
    return {
      fecha: d.fecha,
      numero: String(Number(d.fecha.slice(8))),
      etiquetaCorta: formatear(instante, 'EEE', zona),
      etiquetaLarga: formatearFechaLarga(instante, zona),
      esHoy: d.fecha === hoy,
      delMes: d.delMes,
    };
  });

  function citaVista(
    fila: FilaAgenda,
    colocacion: Pick<CitaVista, 'tramo' | 'diaIndice' | 'minutoPared' | 'duracionMinutos' | 'columna' | 'columnasEnGrupo'>,
  ): CitaVista {
    const estado = estadoParaPunto(fila.estado, fila.enCurso);
    const propia = fila.profesionalId === usuarioId;
    const deSerie = fila.serieId !== null;
    const propuesta = propuestaDe.get(fila.id);
    const minutosTotales = Math.round((fila.fin.getTime() - fila.inicio.getTime()) / 60_000);
    return {
      id: fila.id,
      pacienteId: fila.pacienteId,
      ...colocacion,
      fechaLocal: fechaLocal(fila.inicio, zona),
      horaLocal: formatear(fila.inicio, 'HH:mm', zona),
      rango: formatearRango(fila.inicio, fila.fin, zona),
      duracion: tCon('agenda.cita.minutos', { n: minutosTotales }),
      ...nombres(fila),
      profesionalNombre: fila.profesionalNombre ?? t('agenda.cita.profesional'),
      colorProfesional: colorDe(fila.profesionalId),
      tipoNombre: fila.tipoTerapiaNombre,
      centroNombre: fila.centroNombre,
      sala: fila.sala,
      notaOperativa: fila.notaOperativa,
      estado,
      late: fila.id === idQueLate,
      deSerie,
      desviada: fila.desviada,
      motivoDesviacion:
        fila.motivoDesviacion === null ? null : t(`agenda.motivosDesviacion.${fila.motivoDesviacion}`),
      reprogramable: fila.reprogramable,
      alcanceSiguientesPermitido: deSerie && !fila.desviada && fila.reprogramable,
      propuestaPendiente: propuesta
        ? { id: propuesta.id, rango: resumirPropuesta(propuesta).rangoPropuesto }
        : null,
      notas: {
        mostrar:
          RUTA_NOTAS_DISPONIBLE && propia && fila.estado !== 'cancelada' && fila.estado !== 'no_asistida',
        href: rutaNotas(fila.pacienteId, fila.id),
        primario: estado === 'en_curso',
        // El aviso se pinta aunque «Notas» no se muestre (D8).
        diasPendiente: propia && fila.notaPendiente ? diasEntre(fechaLocal(fila.fin, zona), hoy) : null,
      },
    };
  }

  let citas: CitaVista[];
  let eje = { desdeMinuto: EJE_DESDE, hastaMinuto: EJE_HASTA };

  if (vista === 'semana') {
    const porId = new Map(filas.map((f) => [f.id, f]));
    const celdas = colocarEnRejilla(
      filas.map((f) => ({ id: f.id, inicio: f.inicio, fin: f.fin })),
      alMediodia(fecha, zona),
      zona,
    );
    const tramos = new Map<string, number>();
    citas = celdas.map((celda) => {
      const fila = porId.get(celda.id) as FilaAgenda;
      const tramo = tramos.get(celda.id) ?? 0;
      tramos.set(celda.id, tramo + 1);
      // Un tramo que no empieza a medianoche empieza en el inicio de la cita: su hora de
      // pared es la de ese instante, no los minutos absolutos del día (D5).
      const inicioPared = new TZDate(fila.inicio, zona);
      const minutoPared =
        celda.inicioMinutos === 0 ? 0 : inicioPared.getHours() * 60 + inicioPared.getMinutes();
      return citaVista(fila, {
        tramo,
        diaIndice: celda.dia,
        minutoPared,
        duracionMinutos: celda.duracionMinutos,
        columna: celda.columna,
        columnasEnGrupo: celda.columnasEnGrupo,
      });
    });
    for (const c of citas) {
      const fin = Math.min(c.minutoPared + c.duracionMinutos, MINUTOS_DIA);
      eje = {
        desdeMinuto: Math.min(eje.desdeMinuto, Math.floor(c.minutoPared / 60) * 60),
        hastaMinuto: Math.max(eje.hastaMinuto, Math.ceil(fin / 60) * 60),
      };
    }
  } else {
    const indice = new Map(dias.map((d, i) => [d.fecha, i]));
    citas = filas.flatMap((fila) => {
      const diaIndice = indice.get(fechaLocal(fila.inicio, zona));
      if (diaIndice === undefined) return [];
      const inicioPared = new TZDate(fila.inicio, zona);
      return [
        citaVista(fila, {
          tramo: 0,
          diaIndice,
          minutoPared: inicioPared.getHours() * 60 + inicioPared.getMinutes(),
          duracionMinutos: Math.round((fila.fin.getTime() - fila.inicio.getTime()) / 60_000),
          columna: 0,
          columnasEnGrupo: 1,
        }),
      ];
    });
  }

  const horas: string[] = [];
  for (let m = eje.desdeMinuto; m < eje.hastaMinuto; m += 60) horas.push(hora(m));

  return {
    vista,
    zona,
    hoy,
    fechaFoco: fecha,
    anterior: vista === 'semana' ? sumarDias(fecha, -7) : sumarMeses(fecha, -1),
    siguiente: vista === 'semana' ? sumarDias(fecha, 7) : sumarMeses(fecha, 1),
    titulo:
      vista === 'semana'
        ? tituloSemana(dias[0].fecha, dias[6].fecha, zona)
        : tCon('agenda.tituloMes', {
            mes: mayuscula(formatear(alMediodia(fecha, zona), 'MMMM', zona)),
            anio: fecha.slice(0, 4),
          }),
    dias,
    eje: { ...eje, horas },
    citas,
    profesionales,
  };
}

/** 1 = lunes … 7 = domingo, en la zona (el mediodía no cae en ningún salto). */
function diaSemana(fecha: string, zona: string): number {
  return Number(formatear(alMediodia(fecha, zona), 'i', zona));
}
