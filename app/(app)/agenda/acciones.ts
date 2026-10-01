'use server';

import { revalidatePath } from 'next/cache';

import { esquemaConfirmarPropuesta, esquemaDescartarPropuesta, esquemaDestinoCita, esquemaReprogramarCita } from '@/lib/citas/esquemas';
import { mensajeParaMotivo } from '@/lib/citas/errores';
import { confirmarPropuesta, descartarPropuesta } from '@/lib/citas/propuestas';
import {
  evaluarModificarSerie,
  prepararMovimiento,
  reprogramarCita,
  type EstadoPropuestaAncla,
} from '@/lib/citas/reprogramar';
import type { DetalleRechazo, MotivoErrorCitas } from '@/lib/citas/tipos';
import { es, t, tCon } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { describirPrevisualizacion, fechaCorta, fechaLarga, type DescripcionSerie } from './frase-serie';

/** Lo que baja al cliente: solo cadenas y banderas, nunca la fila ni la previsualización. */
export type ResultadoAccion =
  | { ok: true; anuncio: string }
  | { ok: false; motivo: MotivoErrorCitas; detalle: DetalleRechazo | null; mensaje: string };

export type ResultadoPrevisualizar =
  | {
      ok: true;
      destino: string;
      /** Bloquea las dos opciones. */
      general: string | null;
      modificar: { disponible: true; descripcion: DescripcionSerie; firma: string } | { disponible: false; mensaje: string };
    }
  | { ok: false; mensaje: string };

function esDetalle(valor: string): valor is DetalleRechazo {
  return valor in es.agenda.rechazos;
}

/** El texto de un rechazo: el del `detalle` si lo hay (§8.5), si no el del motivo. */
function texto(motivo: MotivoErrorCitas | DetalleRechazo, mensaje?: string): string {
  if (esDetalle(motivo)) return t(`agenda.rechazos.${motivo}`);
  return mensaje ?? mensajeParaMotivo(motivo);
}

function fallo(r: { motivo: MotivoErrorCitas; mensaje: string; detalle?: DetalleRechazo }): ResultadoAccion {
  return {
    ok: false,
    motivo: r.motivo,
    detalle: r.detalle ?? null,
    mensaje: r.detalle ? texto(r.detalle) : r.mensaje,
  };
}

/**
 * La regla cambió y la ancla no se movió (revisión TS H11): solo se dice que su propuesta
 * «sigue» en «Por confirmar» cuando se sabe que está, y nunca con dos puntos colgando.
 */
function anuncioNoMovida(
  propuestaAncla: EstadoPropuestaAncla | undefined,
  motivo: MotivoErrorCitas | DetalleRechazo | undefined,
): string {
  if (propuestaAncla === 'ninguna') return t('agenda.moverSerie.noMovidaSinPropuesta');
  if (propuestaAncla === 'pendiente') {
    return motivo
      ? tCon('agenda.moverSerie.noMovida', { motivo: texto(motivo) })
      : t('agenda.moverSerie.noMovidaSinMotivo');
  }
  return tCon('agenda.moverSerie.noMovidaSinComprobar', {
    motivo: motivo ? texto(motivo) : mensajeParaMotivo('desconocido'),
  });
}

function invalido(mensaje: string | undefined): ResultadoAccion {
  return {
    ok: false,
    motivo: 'parametro_invalido',
    detalle: null,
    mensaje: mensaje ?? mensajeParaMotivo('parametro_invalido'),
  };
}

/**
 * Mover una cita desde la agenda (T-014 §1.6.4 y §8.4). `entrada` es `unknown`: una Server
 * Action es un punto de entrada público y se valida con el mismo esquema que el formulario.
 */
export async function reprogramar(entrada: unknown): Promise<ResultadoAccion> {
  const sesion = await exigirSesion();
  const leida = esquemaReprogramarCita.safeParse(entrada);
  if (!leida.success) return invalido(leida.error.issues[0]?.message);
  const datos = leida.data;

  const r = await reprogramarCita(sesion, datos, new Date());
  if (!r.ok) return fallo(r);

  revalidatePath('/agenda');
  const cuando = { fecha: fechaCorta(datos.fecha, datos.zona), hora: datos.hora };
  if (!r.movida) return { ok: true, anuncio: anuncioNoMovida(r.propuestaAncla, r.motivoNoMovida) };
  if (datos.alcance === undefined) return { ok: true, anuncio: tCon('agenda.reprogramar.hechoSuelta', cuando) };
  if (datos.alcance === 'esta') return { ok: true, anuncio: tCon('agenda.moverSerie.hechoMantener', cuando) };
  const n = r.propuestasPendientes;
  const clave =
    n === 0 ? 'agenda.moverSerie.hechoModificar.ninguna' : n === 1 ? 'agenda.moverSerie.hechoModificar.una' : 'agenda.moverSerie.hechoModificar.varias';
  return { ok: true, anuncio: tCon(clave, { ...cuando, n }) };
}

/**
 * Qué pasaría con la serie si su cita se moviera al destino (T-014 §8.3, paso 2). Solo lee.
 * Un fallo de la preparación bloquea las dos opciones; uno de la serie, solo «modificar».
 */
export async function previsualizarMovimiento(entrada: unknown): Promise<ResultadoPrevisualizar> {
  const sesion = await exigirSesion();
  const leida = esquemaDestinoCita.safeParse(entrada);
  if (!leida.success) {
    return { ok: false, mensaje: leida.error.issues[0]?.message ?? mensajeParaMotivo('parametro_invalido') };
  }
  const datos = leida.data;
  const destino = tCon('agenda.moverSerie.destino', { fecha: fechaLarga(datos.fecha, datos.zona), hora: datos.hora });

  const preparado = await prepararMovimiento(sesion, datos, new Date());
  if (!preparado.ok) {
    return { ok: true, destino, general: texto(preparado.detalle ?? preparado.motivo, preparado.mensaje), modificar: { disponible: false, mensaje: '' } };
  }
  const { cita, inicio } = preparado;
  if (cita.serieId === null) {
    return { ok: true, destino, general: mensajeParaMotivo('parametro_invalido'), modificar: { disponible: false, mensaje: '' } };
  }

  const modificar = await evaluarModificarSerie(sesion, cita, inicio);
  if (modificar.disponible) {
    return {
      ok: true,
      destino,
      general: null,
      modificar: { disponible: true, descripcion: describirPrevisualizacion(modificar.previa), firma: modificar.firma },
    };
  }
  if ('fallo' in modificar) {
    const { motivo, mensaje, detalle } = modificar.fallo;
    return { ok: true, destino, general: null, modificar: { disponible: false, mensaje: texto(detalle ?? motivo, mensaje) } };
  }
  const mensaje = t(`agenda.moverSerie.${modificar.bloqueo}`);
  // «Sin cambio» bloquea las dos: no hay nada que mover.
  return {
    ok: true,
    destino,
    general: modificar.bloqueo === 'sinCambio' ? mensaje : null,
    modificar: { disponible: false, mensaje },
  };
}

export async function confirmarPropuestaAgenda(entrada: unknown): Promise<ResultadoAccion> {
  const sesion = await exigirSesion();
  const leida = esquemaConfirmarPropuesta.safeParse(entrada);
  if (!leida.success) return invalido(leida.error.issues[0]?.message);

  const r = await confirmarPropuesta(sesion, leida.data);
  // Tras un rechazo no se revalida: la fila sigue a la vista con su motivo (§8.5).
  if (!r.ok) return fallo(r);
  revalidatePath('/agenda');
  return { ok: true, anuncio: t('agenda.porConfirmar.hechoConfirmada') };
}

export async function descartarPropuestaAgenda(entrada: unknown): Promise<ResultadoAccion> {
  const sesion = await exigirSesion();
  const leida = esquemaDescartarPropuesta.safeParse(entrada);
  if (!leida.success) return invalido(leida.error.issues[0]?.message);

  const r = await descartarPropuesta(sesion, leida.data);
  if (!r.ok) return fallo(r);
  revalidatePath('/agenda');
  return { ok: true, anuncio: t('agenda.porConfirmar.hechoDescartada') };
}
