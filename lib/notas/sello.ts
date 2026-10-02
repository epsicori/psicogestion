// T-012 · El sello de una versión, leído del sobre sellado (§2.13 del diseño): lo que dice
// la pantalla es lo que prueba la huella, no un dato mutable de otra tabla.
import { tz } from '@date-fns/tz';
import { format } from 'date-fns';

import { ESQUEMA_VERSION, esquemaSobre } from '@/lib/huella';
import { t, tCon } from '@/lib/i18n';

export interface SelloLeido {
  citaId: string | null;
  abiertaEn: Date;
  firmadaEn: Date;
  redactadaEnSesion: boolean;
  margenMinutos: number | null;
  fechaSesion: string;
}

/** `null` si no es JSON, no es un sobre válido o no es de la era vigente. */
export function leerSello(contenidoCanonico: string): SelloLeido | null {
  let crudo: unknown;
  try {
    crudo = JSON.parse(contenidoCanonico);
  } catch {
    return null;
  }
  const analizado = esquemaSobre.safeParse(crudo);
  if (!analizado.success || analizado.data.esquema_version !== ESQUEMA_VERSION) return null;
  const s = analizado.data;
  return {
    citaId: s.cita_id,
    abiertaEn: new Date(s.abierta_en),
    firmadaEn: new Date(s.firmada_en),
    redactadaEnSesion: s.redactada_en_sesion,
    margenMinutos: s.margen_sesion_minutos,
    fechaSesion: s.fecha_sesion,
  };
}

const hora = (instante: Date, zona: string) => format(instante, 'HH:mm', { in: tz(zona) });
/** El día local del instante, «AAAA-MM-DD»: sirve para comparar y para componer. */
const diaIso = (instante: Date, zona: string) => format(instante, 'yyyy-MM-dd', { in: tz(zona) });

/** «AAAA-MM-DD» → «dd/MM», o «dd/MM/yyyy» si la frase cruza de año. No pasa por un `Date`. */
function fechaCorta(iso: string, conAnio: boolean): string {
  const [anio, mes, d] = iso.split('-');
  return conAnio ? `${d}/${mes}/${anio}` : `${d}/${mes}`;
}

/**
 * La frase de §2.13. Un sobre ilegible es «Sello no legible», nunca `false`.
 *
 * Describe CUÁNDO SE ESCRIBIÓ (R2-H4), no cuándo fue la sesión:
 *  - las horas van sin fecha solo si abierta y firmada caen el mismo día local Y, cuando hay
 *    cita, ese día es el de `fecha_sesion`; si no, cada hora lleva su fecha, para que no parezca
 *    escrita el día de la sesión;
 *  - sin cita, `{fecha}` es el día de `abierta_en`, no el de `fecha_sesion`;
 *  - si las fechas de la frase no caen en el mismo año, todas llevan año.
 */
export function fraseDelSello(s: SelloLeido | null, zona: string): string {
  if (s === null) return t('notas.sello.ilegible');

  const diaAbierta = diaIso(s.abiertaEn, zona);
  const diaFirmada = diaIso(s.firmadaEn, zona);
  const conCita = s.citaId !== null;
  const diaFecha = conCita ? s.fechaSesion : diaAbierta;

  const conAnio = new Set([diaAbierta, diaFirmada, diaFecha].map((d) => d.slice(0, 4))).size > 1;
  const mismoDia = diaAbierta === diaFirmada && diaAbierta === diaFecha;

  const desde = mismoDia
    ? hora(s.abiertaEn, zona)
    : `${fechaCorta(diaAbierta, conAnio)} ${hora(s.abiertaEn, zona)}`;
  const hasta = mismoDia
    ? hora(s.firmadaEn, zona)
    : `${fechaCorta(diaFirmada, conAnio)} ${hora(s.firmadaEn, zona)}`;

  // R2-H12: sin cita y con abierta/firmada en días distintos, «Escrita el {fecha}» afirmaría un
  // solo día; lo que prueba el sobre es un intervalo.
  const clave = !conCita
    ? diaAbierta === diaFirmada
      ? 'notas.sello.sinCita'
      : 'notas.sello.sinCitaVariosDias'
    : s.redactadaEnSesion
      ? 'notas.sello.enSesion'
      : 'notas.sello.fueraDeSesion';
  return tCon(clave, { fecha: fechaCorta(diaFecha, conAnio), desde, hasta });
}
