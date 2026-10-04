import 'server-only';

import { format } from 'date-fns';
import { tz } from '@date-fns/tz';

import type { RolUsuario } from '@/components/armazon/modulos';
import { sugerirHuecos, type CitaPasada, type ResultadoSugerencias } from '@/lib/agenda/sugerencias';
import { zonaDeCentro } from '@/lib/citas/agenda';
import { leerBloques, leerUltimasCitasPaciente, type BloqueAlta, type CitaPasadaAlta } from '@/lib/citas/alta';
import type { ResultadoCitas, Sesion } from '@/lib/citas/tipos';
import { diaDeLaSemana, diasEntre, sumarDias } from '@/lib/fechas/calendario';
import { formatearHora } from '@/lib/fechas/formato';

import { hoyEn, leerRol } from '../bloques';
import {
  construirCalendarioAlta,
  construirTarjetas,
  lunesDe,
  type CalendarioAlta,
  type TarjetaVista,
} from './vista-alta';

/**
 * El servidor del alta (T-028): rol, duración del catálogo, reloj del centro y la vista que
 * comparten la carga inicial y las acciones. Nada de lo que sale de aquí lleva el tipo de terapia,
 * ni su id ni su nombre (ADR-074.2): la duración es un número y nada más.
 */

/** El valor por defecto de `tipos_terapia.duracion_minutos`: se usa mientras no se elige tipo. */
export const DURACION_INICIAL = 50;

/** Cuántos días hacia delante buscan las sugerencias. */
const DIAS_DE_SUGERENCIAS = 28;
/** El máximo que acepta `agenda_bloques_profesional`. */
const MAXIMO_DIAS_RPC = 62;

export type VistaAlta = {
  calendario: CalendarioAlta;
  modo: ResultadoSugerencias['modo'];
  tarjetas: TarjetaVista[];
  /** El cálculo de sugerencias falló: se dice, y el calendario sigue sirviendo. */
  errorSugerencias: boolean;
};

/** El rol de quien actúa, leído en el servidor; sin perfil legible, `null`. */
export async function rolDe(sesion: Sesion): Promise<RolUsuario | null> {
  const { data, error } = await sesion.supabase.from('perfiles').select('rol').eq('id', sesion.usuario.id).maybeSingle();
  if (error) console.error('Alta de cita: fallo al leer el rol', error);
  return leerRol(data?.rol);
}

/** La duración del tipo activo, o `null` si no existe o está inactivo. Solo esa columna. */
export async function duracionDeTipo(sesion: Sesion, tipoTerapiaId: string): Promise<number | null> {
  const { data, error } = await sesion.supabase
    .from('tipos_terapia')
    .select('duracion_minutos')
    .eq('id', tipoTerapiaId)
    .eq('activo', true)
    .maybeSingle();
  if (error) console.error('Alta de cita: fallo al leer el catálogo de tipos', error);
  return data?.duracion_minutos ?? null;
}

/** La zona del centro y «hoy» en ella. Solo se llama en servidor, tras `connection()` o en una acción. */
export async function relojDelCentro(sesion: Sesion, centroId: string): Promise<ResultadoCitas<{ zona: string; hoy: string }>> {
  const zona = await zonaDeCentro(sesion, centroId);
  if (!zona.ok) return zona;
  return { ok: true, zona: zona.zona, hoy: hoyEn(new Date(), zona.zona) };
}

function pasadaDe(cita: CitaPasadaAlta): CitaPasada {
  const instante = new Date(cita.inicio);
  const fecha = format(instante, 'yyyy-MM-dd', { in: tz(cita.zonaHoraria) });
  return { fecha, diaSemana: diaDeLaSemana(fecha), horaLocal: formatearHora(instante, cita.zonaHoraria) };
}

export type EntradaVistaAlta = {
  pacienteId: string | null;
  profesionalId: string;
  centroId: string;
  duracionMinutos: number;
  fechaFoco: string | null;
  excluir: string[];
  zona: string;
  hoy: string;
};

/**
 * Los bloques de la semana que se mira y las sugerencias de las próximas cuatro semanas, con
 * una sola consulta cuando caben en las 62 días de la RPC. `sugerirHuecos` ordena, recorta y
 * valida `hoy`: aquí no se vuelve a hacer. Si lanza, `errorSugerencias` y el calendario sigue.
 */
export async function cargarVistaAlta(
  sesion: Sesion,
  rol: RolUsuario,
  entrada: EntradaVistaAlta,
): Promise<ResultadoCitas<{ vista: VistaAlta }>> {
  const { hoy, zona } = entrada;
  const ventanaHasta = sumarDias(hoy, DIAS_DE_SUGERENCIAS - 1);
  const semanaDesde = lunesDe(entrada.fechaFoco ?? hoy);
  const semanaHasta = sumarDias(semanaDesde, 6);
  const base = { profesionalId: entrada.profesionalId, centroId: entrada.centroId, duracionMinutos: entrada.duracionMinutos };

  const desde = semanaDesde < hoy ? semanaDesde : hoy;
  const hasta = semanaHasta > ventanaHasta ? semanaHasta : ventanaHasta;
  const juntas = diasEntre(desde, hasta) + 1 <= MAXIMO_DIAS_RPC;

  let bloquesSemana: BloqueAlta[];
  let bloquesVentana: BloqueAlta[];
  if (juntas) {
    const lectura = await leerBloques(sesion, { ...base, desde, hasta });
    if (!lectura.ok) return lectura;
    bloquesSemana = lectura.bloques;
    bloquesVentana = lectura.bloques.filter((b) => b.fecha >= hoy && b.fecha <= ventanaHasta);
  } else {
    const [semana, ventana] = await Promise.all([
      leerBloques(sesion, { ...base, desde: semanaDesde, hasta: semanaHasta }),
      leerBloques(sesion, { ...base, desde: hoy, hasta: ventanaHasta }),
    ]);
    if (!semana.ok) return semana;
    if (!ventana.ok) return ventana;
    bloquesSemana = semana.bloques;
    bloquesVentana = ventana.bloques;
  }

  let sugerencias: ResultadoSugerencias = { modo: 'enFrio', sugerencias: [] };
  let errorSugerencias = false;
  try {
    let citas: CitaPasadaAlta[] = [];
    if (entrada.pacienteId) {
      const pasadas = await leerUltimasCitasPaciente(sesion, rol, {
        pacienteId: entrada.pacienteId,
        profesionalId: entrada.profesionalId,
        antesDe: new Date(),
      });
      if (!pasadas.ok) throw new Error(pasadas.mensaje);
      citas = pasadas.citas;
    }
    sugerencias = sugerirHuecos({
      pasadas: citas.map(pasadaDe),
      libres: bloquesVentana
        .filter((b) => b.estado === 'libre')
        .map((b) => ({ fecha: b.fecha, horaLocal: b.horaLocal, diaSemana: diaDeLaSemana(b.fecha) })),
      hoy,
      excluir: entrada.excluir,
    });
  } catch (error) {
    console.error('Alta de cita: fallo al calcular las sugerencias', error);
    errorSugerencias = true;
  }

  const { modo, tarjetas } = construirTarjetas(sugerencias, zona);
  return {
    ok: true,
    vista: {
      calendario: construirCalendarioAlta({ fechaFoco: entrada.fechaFoco ?? hoy, zona, hoy, bloques: bloquesSemana, sugerencias }),
      modo,
      tarjetas,
      errorSugerencias,
    },
  };
}
