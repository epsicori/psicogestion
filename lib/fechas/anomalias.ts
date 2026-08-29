// Anomalías del cambio de hora (ADR-034): una hora local puede no existir
// (salto de marzo) o existir dos veces (solape de octubre). La función
// clasifica y no decide: qué se hace con una cita ambigua es de T-011.
import { tzOffset, tzScan } from '@date-fns/tz';

export type ClasificacionHoraLocal = 'normal' | 'inexistente' | 'ambigua';

export interface ResultadoHoraLocal {
  clasificacion: ClasificacionHoraLocal;
  /** Instantes candidatos: ninguno, uno o dos, en orden cronológico. */
  candidatos: Date[];
}

const MILISEGUNDOS_POR_MINUTO = 60_000;
const MARGEN_DE_EXPLORACION_MS = 2 * 24 * 60 * MILISEGUNDOS_POR_MINUTO;

const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const PATRON_HORA = /^(\d{2}):(\d{2})$/;

/** Reloj de pared del instante en la zona, descompuesto en partes numéricas. */
function relojDePared(instante: Date, zona: string) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante);
  const porTipo = new Map(partes.map((p) => [p.type, p.value]));
  return {
    fecha: `${porTipo.get('year')}-${porTipo.get('month')}-${porTipo.get('day')}`,
    hora: `${porTipo.get('hour')}:${porTipo.get('minute')}`,
  };
}

/**
 * Clasifica una hora local (`'2026-03-29'`, `'02:30'`) en una zona IANA:
 * `normal` si existe una vez, `inexistente` si cae en el salto de marzo y
 * `ambigua` si cae en el solape de octubre. Devuelve además los instantes
 * candidatos: ninguno, uno o dos.
 *
 * Método: se prueban todos los desfases que la zona usa alrededor de ese día
 * (los que `tzScan` encuentra y los vigentes a ambos lados) y se conservan
 * los que, restados a la hora de pared, producen un instante cuyo reloj de
 * pared en la zona vuelve a ser el pedido.
 */
export function clasificarHoraLocal(
  fechaLocal: string,
  horaLocal: string,
  zona: string,
): ResultadoHoraLocal {
  const fecha = PATRON_FECHA.exec(fechaLocal);
  const hora = PATRON_HORA.exec(horaLocal);
  if (!fecha || !hora) {
    throw new Error(`Hora local mal formada: '${fechaLocal}' '${horaLocal}' (se espera 'AAAA-MM-DD' y 'HH:MM').`);
  }

  const [, ano, mes, dia] = fecha;
  const [, horas, minutos] = hora;
  const referenciaUTC = Date.UTC(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    Number(horas),
    Number(minutos),
  );

  const desde = new Date(referenciaUTC - MARGEN_DE_EXPLORACION_MS);
  const hasta = new Date(referenciaUTC + MARGEN_DE_EXPLORACION_MS);
  const desfases = new Set<number>([
    tzOffset(zona, desde),
    tzOffset(zona, hasta),
    ...tzScan(zona, { start: desde, end: hasta }).map((cambio) => cambio.offset),
  ]);

  const candidatos = new Set<number>();
  for (const desfase of desfases) {
    const candidato = new Date(referenciaUTC - desfase * MILISEGUNDOS_POR_MINUTO);
    const pared = relojDePared(candidato, zona);
    if (pared.fecha === fechaLocal && pared.hora === horaLocal) {
      candidatos.add(candidato.getTime());
    }
  }

  const instantes = [...candidatos].sort((a, b) => a - b).map((ms) => new Date(ms));
  const clasificacion: ClasificacionHoraLocal =
    instantes.length === 0 ? 'inexistente' : instantes.length === 1 ? 'normal' : 'ambigua';

  return { clasificacion, candidatos: instantes };
}
