import 'server-only';

import { tz } from '@date-fns/tz';
import { format } from 'date-fns';

import { clasificarHoraLocal } from '../fechas/anomalias';
import { leerCita, zonaDeCentro, type FilaCitaMinima } from './agenda';
import { desplazarCita } from './citas';
import { mensajeParaMotivo } from './errores';
import type { DatosDestinoCita, DatosReprogramarCita } from './esquemas';
import { previsualizarEdicionSerie, type PrevisualizacionSerie } from './previsualizar';
import { confirmarPropuesta, listarPropuestasPendientes } from './propuestas';
import { editarSerie } from './series';
import type { DetalleRechazo, MotivoErrorCitas, ResultadoCitas, Sesion } from './tipos';

/**
 * Mover una cita desde la agenda (T-014 §1.3, §8.2, §8.4). Nunca escribe en
 * `citas` directamente: todo movimiento pasa por `agenda_actualizar_cita`,
 * `agenda_editar_serie` o `agenda_confirmar_propuesta`, y por tanto por su
 * auditoría. Nunca descarta una propuesta, y solo confirma una: la de la cita
 * que el usuario acaba de mover.
 */

type Fallo = { ok: false; motivo: MotivoErrorCitas; mensaje: string; detalle?: DetalleRechazo };

function falloInvalido(mensaje: string, detalle?: DetalleRechazo): Fallo {
  return detalle
    ? { ok: false, motivo: 'parametro_invalido', mensaje, detalle }
    : { ok: false, motivo: 'parametro_invalido', mensaje };
}

const MENSAJE_OTRA_ZONA_VISTA = 'La vista estaba en otra zona horaria; recarga la agenda.';
const MENSAJE_INEXISTENTE = 'Esa hora no existe ese día por el cambio de hora.';
const MENSAJE_AMBIGUA = 'Esa hora se repite ese día por el cambio de hora; elige otra.';
const MENSAJE_ELIGE = 'Elige solo esta, o esta y las siguientes.';
const MENSAJE_SUELTA_CON_ALCANCE = 'Esta cita no pertenece a una serie.';
const MENSAJE_YA_EMPEZADA = 'La cita ya ha empezado o ha pasado.';
const MENSAJE_CANCELADA_O_CERRADA = 'La cita está cancelada o cerrada.';
const MENSAJE_MOVIDA_A_MANO ='La cita se movió a mano y la serie ya no la gobierna.';

/** Por qué «modificar la serie» no se puede ofrecer, aunque «mantener» sí. */
export type BloqueoModificar = 'horaDistintaEnSerie' | 'serieOtraZona' | 'sinCambio';

const MENSAJE_BLOQUEO: Record<BloqueoModificar, string> = {
  horaDistintaEnSerie: 'Esa hora no existe o se repite ese día en la zona horaria de la serie; elige otra.',
  serieOtraZona: 'La serie está en otra zona horaria que esta cita; mueve solo esta cita.',
  sinCambio: 'La cita ya está en ese día y a esa hora.',
};

export type MovimientoPreparado = { cita: FilaCitaMinima; inicio: Date; fin: Date };

/**
 * Pasos comunes a mover y a previsualizar: cargar la cita, comprobar que no
 * ha pasado, que la vista estaba en la zona del centro, que la hora de pared
 * existe una sola vez ese día y que el destino no ha pasado. La duración se
 * conserva: `fin − inicio` es la de la cita original.
 */
export async function prepararMovimiento(
  sesion: Sesion,
  datos: DatosDestinoCita,
  ahora: Date,
): Promise<ResultadoCitas<MovimientoPreparado>> {
  const leida = await leerCita(sesion, datos.citaId);
  if (!leida.ok) return leida;
  const { cita } = leida;

  if (cita.fin.getTime() <= ahora.getTime()) {
    return { ok: false, motivo: 'cita_pasada', mensaje: mensajeParaMotivo('cita_pasada') };
  }
  // Revisión SQL H4: la base (fn_proteger_cita_pasada) solo impide mover lo que ya acabó;
  // una cita en curso o cancelada/cerrada no se mueve desde la agenda, igual que no es
  // `reprogramable` en agenda_citas_rango. Los textos son los de T-011b (errores.ts).
  if (cita.inicio.getTime() <= ahora.getTime()) return falloInvalido(MENSAJE_YA_EMPEZADA, 'yaEmpezada');
  if (cita.estado !== 'programada' && cita.estado !== 'confirmada') {
    return falloInvalido(MENSAJE_CANCELADA_O_CERRADA, 'canceladaOCerrada');
  }

  const zona = await zonaDeCentro(sesion, cita.centroId);
  if (!zona.ok) return zona;
  if (zona.zona !== datos.zona) return falloInvalido(MENSAJE_OTRA_ZONA_VISTA);

  const hora = clasificarHoraLocal(datos.fecha, datos.hora, zona.zona);
  if (hora.clasificacion === 'inexistente') return falloInvalido(MENSAJE_INEXISTENTE);
  if (hora.clasificacion === 'ambigua') return falloInvalido(MENSAJE_AMBIGUA);

  const inicio = hora.candidatos[0];
  const fin = new Date(inicio.getTime() + (cita.fin.getTime() - cita.inicio.getTime()));

  if (inicio.getTime() <= ahora.getTime()) {
    return { ok: false, motivo: 'destino_pasado', mensaje: mensajeParaMotivo('destino_pasado') };
  }

  return { ok: true, cita, inicio, fin };
}

/**
 * Día y hora de pared de `inicio` en la zona de la SERIE (la de la cita), que
 * es como `agenda_editar_serie` interpreta `p_fecha + p_hora_local`. Puede no
 * ser la zona de la vista.
 */
export function ubicarEnSerie(cita: FilaCitaMinima, inicio: Date): { fecha: string; hora: string } {
  const contexto = tz(cita.zonaHoraria);
  return { fecha: format(inicio, 'yyyy-MM-dd', { in: contexto }), hora: format(inicio, 'HH:mm', { in: contexto }) };
}

export type EstadoModificar =
  | { disponible: true; previa: PrevisualizacionSerie; firma: string }
  | { disponible: false; bloqueo: BloqueoModificar; mensaje: string }
  | { disponible: false; fallo: Fallo };

/**
 * ¿Se puede ofrecer «esta y las siguientes» para este destino? Pide la
 * previsualización a la base y le aplica las guardas de §8.3: que la serie
 * esté en la zona de la cita, que la ancla caiga exactamente en el destino
 * elegido y con una hora `normal`, y que haya algo que cambiar.
 */
export async function evaluarModificarSerie(
  sesion: Sesion,
  cita: FilaCitaMinima,
  inicio: Date,
): Promise<EstadoModificar> {
  const bloqueo = (motivo: BloqueoModificar): EstadoModificar => ({
    disponible: false,
    bloqueo: motivo,
    mensaje: MENSAJE_BLOQUEO[motivo],
  });

  const { fecha, hora } = ubicarEnSerie(cita, inicio);
  if (clasificarHoraLocal(fecha, hora, cita.zonaHoraria).clasificacion !== 'normal') {
    return bloqueo('horaDistintaEnSerie');
  }

  const vista = await previsualizarEdicionSerie(sesion, { citaId: cita.id, fecha, horaLocal: hora });
  if (!vista.ok) {
    const { ok, motivo, mensaje, detalle } = vista;
    return { disponible: false, fallo: detalle ? { ok, motivo, mensaje, detalle } : { ok, motivo, mensaje } };
  }

  const { previa, firma } = vista;
  if (previa.reglaAnterior.zonaHoraria !== cita.zonaHoraria) return bloqueo('serieOtraZona');
  if (!previa.cambia) return bloqueo('sinCambio');

  const ancla = previa.citas.find((c) => c.citaId === cita.id);
  if (
    !ancla ||
    ancla.clasificacion !== 'normal' ||
    ancla.inicio === null ||
    new Date(ancla.inicio).getTime() !== inicio.getTime()
  ) {
    return bloqueo('horaDistintaEnSerie');
  }

  return { disponible: true, previa, firma };
}

/**
 * Cuando la regla cambió pero la ancla no se movió: si su propuesta queda en «Por
 * confirmar» (`pendiente`), si no la hay (`ninguna`), o si no se pudo leer la bandeja
 * (`desconocida`). El anuncio no puede decir que «sigue» ahí sin saberlo (revisión TS H11).
 */
export type EstadoPropuestaAncla = 'pendiente' | 'ninguna' | 'desconocida';

export type ResultadoReprogramar = ResultadoCitas<{
  movida: boolean;
  propuestasPendientes: number;
  motivoNoMovida?: DetalleRechazo | MotivoErrorCitas;
  propuestaAncla?: EstadoPropuestaAncla;
}>;

/**
 * Mueve una cita. Suelta: `agenda_actualizar_cita`. De serie, «esta»: la
 * cita sola, que queda desviada. De serie, «esta y las siguientes»: cambia la
 * regla desde esta cita si la previsualización sigue siendo la que se firmó,
 * y confirma SOLO la propuesta de esta cita, y solo si cae exactamente donde
 * se soltó. Las demás quedan en «Por confirmar».
 */
export async function reprogramarCita(
  sesion: Sesion,
  datos: DatosReprogramarCita,
  ahora: Date,
): Promise<ResultadoReprogramar> {
  const preparado = await prepararMovimiento(sesion, datos, ahora);
  if (!preparado.ok) return preparado;
  const { cita, inicio, fin } = preparado;

  if (cita.serieId === null) {
    if (datos.alcance !== undefined) return falloInvalido(MENSAJE_SUELTA_CON_ALCANCE);
    const movida = await desplazarCita(sesion, {
      citaId: cita.id,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
    });
    return movida.ok ? { ok: true, movida: true, propuestasPendientes: 0 } : movida;
  }

  if (datos.alcance === undefined) return falloInvalido(MENSAJE_ELIGE);

  if (datos.alcance === 'esta') {
    const editada = await editarSerie(sesion, {
      citaId: cita.id,
      alcance: 'esta',
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
    });
    return editada.ok ? { ok: true, movida: true, propuestasPendientes: 0 } : editada;
  }

  // esta_y_siguientes (§8.4).
  if (cita.desviada) return falloInvalido(MENSAJE_MOVIDA_A_MANO, 'movidaAMano');

  const modificar = await evaluarModificarSerie(sesion, cita, inicio);
  if (!modificar.disponible) {
    return 'fallo' in modificar ? modificar.fallo : falloInvalido(modificar.mensaje);
  }
  // La firma se compara ANTES de editar: si la regla que resultaría ya no es
  // la que el usuario vio, no se toca nada.
  if (modificar.firma !== datos.firma) {
    return {
      ok: false,
      motivo: 'previsualizacion_caducada',
      mensaje: mensajeParaMotivo('previsualizacion_caducada'),
    };
  }

  const { fecha, hora } = ubicarEnSerie(cita, inicio);
  const editada = await editarSerie(sesion, {
    citaId: cita.id,
    alcance: 'esta_y_siguientes',
    fecha,
    horaLocal: hora,
  });
  if (!editada.ok) return editada;

  const { propuestaIds } = editada;
  const noMovida = (
    propuestaAncla: EstadoPropuestaAncla,
    motivo?: DetalleRechazo | MotivoErrorCitas,
  ): ResultadoReprogramar =>
    motivo
      ? { ok: true, movida: false, propuestasPendientes: propuestaIds.length, motivoNoMovida: motivo, propuestaAncla }
      : { ok: true, movida: false, propuestasPendientes: propuestaIds.length, propuestaAncla };

  // La regla ya cambió: a partir de aquí ningún fallo es un fallo de la
  // operación. Si la ancla no se puede mover, su propuesta queda a la vista.
  const pendientes = await listarPropuestasPendientes(sesion);
  if (!pendientes.ok) return noMovida('desconocida', pendientes.motivo);

  const propuestaAncla = pendientes.propuestas.find(
    (p) => propuestaIds.includes(p.id) && p.citaId === cita.id,
  );
  if (!propuestaAncla) return noMovida('ninguna');
  if (
    propuestaAncla.inicioPropuesto === null ||
    new Date(propuestaAncla.inicioPropuesto).getTime() !== inicio.getTime()
  ) {
    return noMovida('pendiente');
  }

  const confirmada = await confirmarPropuesta(sesion, { propuestaId: propuestaAncla.id });
  if (!confirmada.ok) return noMovida('pendiente', confirmada.detalle ?? confirmada.motivo);

  return { ok: true, movida: true, propuestasPendientes: propuestaIds.length - 1 };
}
