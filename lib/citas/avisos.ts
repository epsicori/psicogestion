import 'server-only';

import type { RecuentoNotas, SesionPropia } from '../agenda/avisos';
import { formatearHora } from '../fechas/formato';
import { leerCitasRango } from './agenda';
import type { Sesion } from './tipos';

/**
 * Lecturas de los avisos del armazón (T-015). Todo pasa por la sesión del usuario y su RLS.
 * Nada clínico: las notificaciones no llevan contenido de la historia (ADR-038) y el recuento
 * son tres números.
 */

export type { RecuentoNotas, SesionPropia };

export type NotificacionVista = {
  id: string;
  tipo: string;
  titulo: string | null;
  detalle: string;
  creadoEn: Date;
  leida: boolean;
};

const COLUMNAS_NOTIFICACION = 'id, tipo, titulo, detalle, creado_en, leida_en';
const MAX_NO_LEIDAS = 50;
const MAX_LEIDAS = 10;
const HORIZONTE_SESIONES_MS = 12 * 60 * 60 * 1000;

type FilaNotificacion = {
  id: string;
  tipo: string;
  titulo: string | null;
  detalle: string;
  creado_en: string;
  leida_en: string | null;
};

function aVista(fila: FilaNotificacion): NotificacionVista {
  return {
    id: fila.id,
    tipo: fila.tipo,
    titulo: fila.titulo,
    detalle: fila.detalle,
    creadoEn: new Date(fila.creado_en),
    leida: fila.leida_en !== null,
  };
}

/** Las no leídas (hasta 50) primero y después las 10 últimas leídas. Sin filtrar por tipo. */
export async function leerNotificaciones(sesion: Sesion): Promise<NotificacionVista[]> {
  const [noLeidas, leidas] = await Promise.all([
    sesion.supabase
      .from('notificaciones')
      .select(COLUMNAS_NOTIFICACION)
      .is('leida_en', null)
      .order('creado_en', { ascending: false })
      .limit(MAX_NO_LEIDAS),
    sesion.supabase
      .from('notificaciones')
      .select(COLUMNAS_NOTIFICACION)
      .not('leida_en', 'is', null)
      .order('creado_en', { ascending: false })
      .limit(MAX_LEIDAS),
  ]);

  if (noLeidas.error || leidas.error) {
    console.error('leerNotificaciones: fallo al leer notificaciones', noLeidas.error ?? leidas.error);
    return [];
  }

  return [...(noLeidas.data ?? []), ...(leidas.data ?? [])].map(aVista);
}

/** El recuento de la cabecera. Si falla, ceros: no se inventan números. */
export async function leerRecuentoNotas(sesion: Sesion): Promise<RecuentoNotas> {
  const { data, error } = await sesion.supabase.rpc('recuento_notas_pendientes');
  const fila = data?.[0];
  if (error || !fila) {
    if (error) console.error('leerRecuentoNotas: recuento_notas_pendientes() falló', error);
    return { nivel1: 0, nivel2: 0, nivel3: 0 };
  }
  return { nivel1: fila.nivel1, nivel2: fila.nivel2, nivel3: fila.nivel3 };
}

/** Las sesiones propias de las próximas 12 h que pueden estar en curso. */
export async function leerSesionesPropias(sesion: Sesion, ahora: Date): Promise<SesionPropia[]> {
  const resultado = await leerCitasRango(
    sesion,
    ahora,
    new Date(ahora.getTime() + HORIZONTE_SESIONES_MS),
  );
  if (!resultado.ok) {
    return [];
  }
  return resultado.filas
    .filter(
      (fila) =>
        fila.profesionalId === sesion.usuario.id &&
        fila.estado !== 'cancelada' &&
        fila.estado !== 'no_asistida',
    )
    .map((fila) => ({
      citaId: fila.id,
      pacienteId: fila.pacienteId,
      nombrePaciente: [fila.pacienteNombre, fila.pacienteApellidos].filter(Boolean).join(' '),
      inicio: fila.inicio.toISOString(),
      fin: fila.fin.toISOString(),
      desde: formatearHora(fila.inicio, fila.zonaHoraria),
      hasta: formatearHora(fila.fin, fila.zonaHoraria),
      estado: fila.estado,
    }));
}
