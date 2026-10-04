'use server';

import { revalidatePath } from 'next/cache';

import { crearCitaSuelta, crearSerieAlta, previsualizarAlta } from '@/lib/citas/alta';
import { mensajeParaMotivo } from '@/lib/citas/errores';
import {
  esquemaAltaCita,
  esquemaBuscarPacientes,
  esquemaPrevisualizarAltaSerie,
  esquemaRecalcularAlta,
} from '@/lib/citas/esquemas';
import type { MotivoErrorCitas, Sesion } from '@/lib/citas/tipos';
import { diaDeLaSemana } from '@/lib/fechas/calendario';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import {
  cargarVistaAlta,
  DURACION_INICIAL,
  duracionDeTipo,
  relojDelCentro,
  rolDe,
  type VistaAlta,
} from './estado-alta';
import { presentarSerie, type SesionVista } from './vista-alta';

/**
 * Las acciones del alta de cita (T-028). Cada una: `exigirSesion()`, el mismo esquema Zod que el
 * formulario, el rol leído aquí y la duración leída del catálogo. Nada de lo que devuelven lleva
 * el tipo de terapia, ni su id ni su nombre (ADR-074.2): el formulario conserva lo que eligió.
 */

type MotivoAlta = MotivoErrorCitas | 'tipo_no_valido';

type Fallo = { ok: false; motivo: MotivoAlta; mensaje: string };

export type ResultadoRecalcular = { ok: true; vista: VistaAlta; duracionMinutos: number } | Fallo;

export type ResultadoPrevisualizarSerie = { ok: true; sesiones: SesionVista[]; firma: string } | Fallo;

export type ResultadoGuardarAlta =
  | { ok: true; anuncio: string; fecha: string }
  | { ok: false; motivo: 'hueco_ocupado'; mensaje: string; vista: VistaAlta | null }
  | { ok: false; motivo: 'previsualizacion_caducada'; mensaje: string; sesiones: SesionVista[]; firma: string }
  | Fallo;

export type ResultadoBuscarPacientes =
  | { ok: true; pacientes: { id: string; nombre: string }[] }
  | { ok: false; mensaje: string };

function falla(motivo: MotivoAlta, mensaje?: string): Fallo {
  return {
    ok: false,
    motivo,
    mensaje: mensaje ?? (motivo === 'tipo_no_valido' ? t('agenda.alta.error.tipoNoValido') : mensajeParaMotivo(motivo)),
  };
}

/** Quien agenda a su nombre es el profesional de la sesión; el técnico no escribe nota operativa. */
function aplicarRol<T extends { profesionalId: string }>(
  rol: 'administrador' | 'profesional_sanitario' | 'tecnico_administrativo',
  sesion: Sesion,
  datos: T,
): T {
  return rol === 'profesional_sanitario' ? { ...datos, profesionalId: sesion.usuario.id } : datos;
}

/** El calendario y las sugerencias de una semana, con la duración del tipo (o la inicial sin tipo). */
export async function recalcularAlta(entrada: unknown): Promise<ResultadoRecalcular> {
  const sesion = await exigirSesion();
  const leida = esquemaRecalcularAlta.safeParse(entrada);
  if (!leida.success) return falla('parametro_invalido', leida.error.issues[0]?.message);

  const rol = await rolDe(sesion);
  if (!rol) return falla('no_autorizado');
  const datos = aplicarRol(rol, sesion, leida.data);

  const duracionMinutos = datos.tipoTerapiaId ? await duracionDeTipo(sesion, datos.tipoTerapiaId) : DURACION_INICIAL;
  if (duracionMinutos === null) return falla('tipo_no_valido');

  const reloj = await relojDelCentro(sesion, datos.centroId);
  if (!reloj.ok) return falla(reloj.motivo, reloj.mensaje);

  const carga = await cargarVistaAlta(sesion, rol, {
    pacienteId: datos.pacienteId,
    profesionalId: datos.profesionalId,
    centroId: datos.centroId,
    duracionMinutos,
    fechaFoco: datos.fechaFoco,
    excluir: datos.excluir,
    ...reloj,
  });
  if (!carga.ok) return falla(carga.motivo, carga.mensaje);

  return { ok: true, vista: carga.vista, duracionMinutos };
}

/** Las sesiones que tendría la serie y la firma de lo que se enseña. Solo lee. */
export async function previsualizarAltaSerie(entrada: unknown): Promise<ResultadoPrevisualizarSerie> {
  const sesion = await exigirSesion();
  const leida = esquemaPrevisualizarAltaSerie.safeParse(entrada);
  if (!leida.success) return falla('parametro_invalido', leida.error.issues[0]?.message);

  const rol = await rolDe(sesion);
  if (!rol) return falla('no_autorizado');
  const datos = aplicarRol(rol, sesion, leida.data);

  const duracionMinutos = await duracionDeTipo(sesion, datos.tipoTerapiaId);
  if (duracionMinutos === null) return falla('tipo_no_valido');

  const previa = await previsualizarAlta(sesion, {
    pacienteId: datos.pacienteId,
    profesionalId: datos.profesionalId,
    centroId: datos.centroId,
    tipoTerapiaId: datos.tipoTerapiaId,
    periodicidad: datos.periodicidad,
    diaSemana: diaDeLaSemana(datos.fecha),
    horaLocal: datos.horaLocal,
    duracionMinutos,
    desde: datos.fecha,
    sesionesTotales: datos.sesionesTotales,
  });
  if (!previa.ok) return falla(previa.motivo, previa.mensaje);

  return { ok: true, sesiones: presentarSerie(previa.previa, previa.previa.zonaHoraria), firma: previa.firma };
}

/**
 * Guarda la cita suelta o la serie. La serie se previsualiza otra vez y, si la firma no es la que
 * se enseñó, no se crea nada. Un hueco que acaba de ocuparse vuelve con la vista recalculada sin
 * él, para que la pantalla ofrezca otro sin perder el formulario.
 */
export async function guardarAlta(entrada: unknown): Promise<ResultadoGuardarAlta> {
  const sesion = await exigirSesion();
  const leida = esquemaAltaCita.safeParse(entrada);
  if (!leida.success) return falla('parametro_invalido', leida.error.issues[0]?.message);

  const rol = await rolDe(sesion);
  if (!rol) return falla('no_autorizado');
  const datos = aplicarRol(rol, sesion, leida.data);
  const notaOperativa = rol === 'tecnico_administrativo' ? null : datos.notaOperativa;

  const duracionMinutos = await duracionDeTipo(sesion, datos.tipoTerapiaId);
  if (duracionMinutos === null) return falla('tipo_no_valido');

  const comun = { ...datos, notaOperativa, duracionMinutos };

  const huecoOcupado = async (): Promise<ResultadoGuardarAlta> => {
    const reloj = await relojDelCentro(sesion, datos.centroId);
    const carga = reloj.ok
      ? await cargarVistaAlta(sesion, rol, {
          pacienteId: datos.pacienteId,
          profesionalId: datos.profesionalId,
          centroId: datos.centroId,
          duracionMinutos,
          fechaFoco: datos.fecha,
          excluir: [`${datos.fecha}T${datos.horaLocal}`],
          ...reloj,
        })
      : null;
    return {
      ok: false,
      motivo: 'hueco_ocupado',
      mensaje: t('agenda.alta.huecoOcupado'),
      vista: carga?.ok ? carga.vista : null,
    };
  };

  const terminar = (anuncio: string): ResultadoGuardarAlta => {
    revalidatePath('/agenda');
    revalidatePath('/pacientes/[id]', 'page');
    return { ok: true, anuncio, fecha: datos.fecha };
  };

  if (datos.periodicidad === 'suelta') {
    const creada = await crearCitaSuelta(sesion, comun);
    if (!creada.ok) return creada.motivo === 'hueco_ocupado' ? huecoOcupado() : falla(creada.motivo, creada.mensaje);
    return terminar(t('agenda.alta.guardada'));
  }

  const sesionesTotales = datos.sesionesTotales;
  if (sesionesTotales === null || datos.firma === null) return falla('parametro_invalido');
  const periodicidad = datos.periodicidad;
  const diaSemana = diaDeLaSemana(datos.fecha);

  const previa = await previsualizarAlta(sesion, {
    pacienteId: datos.pacienteId,
    profesionalId: datos.profesionalId,
    centroId: datos.centroId,
    tipoTerapiaId: datos.tipoTerapiaId,
    periodicidad,
    diaSemana,
    horaLocal: datos.horaLocal,
    duracionMinutos,
    desde: datos.fecha,
    sesionesTotales,
  });
  if (!previa.ok) return falla(previa.motivo, previa.mensaje);
  if (previa.firma !== datos.firma) {
    return {
      ok: false,
      motivo: 'previsualizacion_caducada',
      mensaje: t('agenda.alta.error.previsualizacionCaducada'),
      sesiones: presentarSerie(previa.previa, previa.previa.zonaHoraria),
      firma: previa.firma,
    };
  }

  const creada = await crearSerieAlta(sesion, { ...comun, periodicidad, diaSemana, sesionesTotales });
  if (!creada.ok) return creada.motivo === 'hueco_ocupado' ? huecoOcupado() : falla(creada.motivo, creada.mensaje);

  const pendientes = creada.propuestasPendientes.length > 0 ? ` ${t('agenda.alta.propuestasPendientes')}` : '';
  return terminar(`${t('agenda.alta.guardadaSerie')}${pendientes}`);
}

/** Quita lo que en un filtro `ilike` de PostgREST sería comodín o separador. */
function limpiarFiltro(texto: string): string {
  return texto.replace(/[%_,()\\*]/g, '').trim();
}

/** Hasta diez pacientes por nombre o apellidos. La RLS decide cuáles ve quien busca. */
export async function buscarPacientes(entrada: unknown): Promise<ResultadoBuscarPacientes> {
  const sesion = await exigirSesion();
  const leida = esquemaBuscarPacientes.safeParse(entrada);
  if (!leida.success) return { ok: false, mensaje: leida.error.issues[0]?.message ?? t('agenda.alta.error.buscar') };

  const texto = limpiarFiltro(leida.data.texto);
  if (texto.length < 2) return { ok: false, mensaje: t('agenda.alta.campos.pacienteBuscarAyuda') };

  const { data, error } = await sesion.supabase
    .from('pacientes')
    .select('id, nombre, apellidos')
    .or(`nombre.ilike.%${texto}%,apellidos.ilike.%${texto}%`)
    .order('apellidos')
    .limit(10);
  if (error) {
    console.error('buscarPacientes: fallo al leer pacientes', error);
    return { ok: false, mensaje: t('agenda.alta.error.buscar') };
  }

  return { ok: true, pacientes: (data ?? []).map((p) => ({ id: p.id, nombre: `${p.nombre} ${p.apellidos}`.trim() })) };
}
