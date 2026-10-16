import { format } from 'date-fns';
import { es as localeEs } from 'date-fns/locale';
import { TZDate, tz } from '@date-fns/tz';

import {
  mesesDelAnio,
  nivelDeDensidad,
  tramosDeDensidad,
  type NivelDensidad,
} from '@/lib/agenda/anio';
import { sumarDias } from '@/lib/fechas/calendario';
import { formatearFechaLarga } from '@/lib/fechas/formato';
import { t, tCon } from '@/lib/i18n';

/**
 * El modelo de la vista anual (T-047): doce mini-meses con el nivel de densidad de cada día.
 * Solo cadenas, números y booleanos (ADR-034): cruza al cliente tal cual.
 */

export type EntradaVistaAnio = {
  /** Fecha de foco ya resuelta, `AAAA-MM-DD`; de ella sale el año. */
  fecha: string;
  zona: string;
  /** Ya resuelto por el llamante en la zona. */
  hoy: string;
  /** Solo los días con citas (la base no devuelve ceros). */
  dias: { dia: string; recuento: number }[];
  profesionales: { id: string; nombre: string | null }[];
};

export type DiaAnio = {
  fecha: string;
  numero: number;
  recuento: number;
  nivel: NivelDensidad;
  /** Nombre accesible: «martes, 3 de marzo de 2026, 7 citas». */
  nombre: string;
  esHoy: boolean;
};

export type MesAnio = {
  /** `AAAA-MM`. */
  clave: string;
  /** «Marzo · 57 citas». */
  titulo: string;
  total: number;
  huecos: number;
  dias: DiaAnio[];
};

export type VistaAnio = {
  vista: 'anio';
  anio: number;
  titulo: string;
  fechaFoco: string;
  hoy: string;
  total: number;
  meses: MesAnio[];
  cabeceras: { corta: string; larga: string }[];
  leyenda: { nivel: NivelDensidad; texto: string }[];
  profesionales: { id: string; nombre: string }[];
};

/** El mediodía del día en la zona (ver `.claude/rules/fechas.md`). */
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

function cuenta(n: number): string {
  if (n === 0) return t('agenda.anio.sinCitas');
  if (n === 1) return t('agenda.rejilla.citas.una');
  return tCon('agenda.rejilla.citas.varias', { n });
}

export function construirVistaAnio(entrada: EntradaVistaAnio): VistaAnio {
  const { fecha, zona, hoy } = entrada;
  const anio = Number(fecha.slice(0, 4));
  const prefijo = `${String(anio).padStart(4, '0')}-`;

  const recuentos = new Map<string, number>();
  for (const f of entrada.dias) {
    if (f.dia.startsWith(prefijo)) recuentos.set(f.dia, (recuentos.get(f.dia) ?? 0) + f.recuento);
  }
  const valores = [...recuentos.values()];
  const maximo = valores.reduce((m, n) => (n > m ? n : m), 0);
  const total = valores.reduce((s, n) => s + n, 0);

  const meses: MesAnio[] = mesesDelAnio(anio).map((m) => {
    const dias: DiaAnio[] = m.dias.map((d) => {
      const recuento = recuentos.get(d) ?? 0;
      return {
        fecha: d,
        numero: Number(d.slice(8)),
        recuento,
        nivel: nivelDeDensidad(recuento, maximo),
        nombre: tCon('agenda.anio.dia', {
          fecha: formatearFechaLarga(alMediodia(d, zona), zona),
          recuento: cuenta(recuento),
        }),
        esHoy: d === hoy,
      };
    });
    const totalMes = dias.reduce((s, d) => s + d.recuento, 0);
    return {
      clave: m.dias[0].slice(0, 7),
      titulo: tCon('agenda.anio.mes', {
        mes: mayuscula(formatear(alMediodia(m.dias[0], zona), 'LLLL', zona)),
        recuento: cuenta(totalMes),
      }),
      total: totalMes,
      huecos: m.huecos,
      dias,
    };
  });

  // Una semana cualquiera que empieza en lunes (5 de enero de 2026) da las siete cabeceras.
  const lunes = '2026-01-05';
  const iniciales = t('agenda.anio.inicialesSemana').split(' ');
  const cabeceras = Array.from({ length: 7 }, (_, i) => {
    const d = alMediodia(sumarDias(lunes, i), zona);
    return { corta: iniciales[i], larga: formatear(d, 'EEEE', zona) };
  });

  const tramos = tramosDeDensidad(valores);
  const leyenda: VistaAnio['leyenda'] =
    total === 0
      ? []
      : [
          { nivel: 0, texto: '0' },
          ...tramos.map((r) => ({
            nivel: r.nivel,
            texto: r.desde === r.hasta ? String(r.desde) : `${r.desde}–${r.hasta}`,
          })),
        ];

  const profesionales = entrada.profesionales
    .map((p) => ({ id: p.id, nombre: p.nombre ?? t('agenda.cita.profesional') }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return {
    vista: 'anio',
    anio,
    titulo: String(anio),
    fechaFoco: fecha,
    hoy,
    total,
    meses,
    cabeceras,
    leyenda,
    profesionales,
  };
}
