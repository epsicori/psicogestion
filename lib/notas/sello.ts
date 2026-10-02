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

const dia = (instante: Date, zona: string) => format(instante, 'dd/MM', { in: tz(zona) });
const hora = (instante: Date, zona: string) => format(instante, 'HH:mm', { in: tz(zona) });

/** «AAAA-MM-DD» → «dd/MM». La fecha de sesión no lleva zona: no pasa por un `Date`. */
function diaDeFecha(fechaSesion: string): string {
  const [, mes, d] = fechaSesion.split('-');
  return `${d}/${mes}`;
}

/** La frase de §2.13. Un sobre ilegible es «Sello no legible», nunca `false`. */
export function fraseDelSello(s: SelloLeido | null, zona: string): string {
  if (s === null) return t('notas.sello.ilegible');

  // Si abierta y firmada caen en días locales distintos, cada hora lleva su dd/MM.
  const mismoDia = dia(s.abiertaEn, zona) === dia(s.firmadaEn, zona);
  const desde = mismoDia
    ? hora(s.abiertaEn, zona)
    : `${dia(s.abiertaEn, zona)} ${hora(s.abiertaEn, zona)}`;
  const hasta = mismoDia
    ? hora(s.firmadaEn, zona)
    : `${dia(s.firmadaEn, zona)} ${hora(s.firmadaEn, zona)}`;

  const clave =
    s.citaId === null
      ? 'notas.sello.sinCita'
      : s.redactadaEnSesion
        ? 'notas.sello.enSesion'
        : 'notas.sello.fueraDeSesion';
  return tCon(clave, { fecha: diaDeFecha(s.fechaSesion), desde, hasta });
}
