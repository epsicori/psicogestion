'use server';

import { headers } from 'next/headers';

import { notasParaCopia, type NotaParaCopia } from '@/lib/exportaciones/servidor';
import * as servidor from '@/lib/notas/servidor';
import { exigirSesion } from '@/lib/supabase/sesion';

import { ipDeLaPeticion } from '../../peticion';
import {
  esquemaApertura,
  esquemaBorrador,
  esquemaCoprofesional,
  esquemaFirma,
  esquemaModificar,
} from './esquemas';

/**
 * Las Server Actions de la nota solo envuelven `lib/notas/servidor.ts`: sesión, Zod, servidor,
 * en ese orden. El `profesional` sale de la sesión, jamás de la entrada. Una acción es un punto de
 * entrada público: el formulario no es la única forma de llamarla.
 */

/**
 * T-040 · P2-a. La administración que no lee una nota la ve como `no_disponible`; si esa nota
 * está entre las que puede pedir por motivo, el editor enseña solo la cabecera y «Pedir copia».
 */
export type ResultadoAperturaConCopia =
  | servidor.ResultadoApertura
  | { estado: 'solo_copia'; nota: NotaParaCopia };

export async function abrirEditorDeNota(entrada: {
  pacienteId: string;
  citaId: string | null;
  notaId: string | null;
  episodioId: string | null;
}): Promise<ResultadoAperturaConCopia> {
  const sesion = await exigirSesion();
  const validada = esquemaApertura.safeParse(entrada);
  if (!validada.success) return { estado: 'no_disponible' };

  const cabeceras = await headers();
  const resultado = await servidor.abrirEditorDeNota(sesion, validada.data, {
    ip: ipDeLaPeticion(cabeceras),
    agente: cabeceras.get('user-agent'),
  });
  const { notaId, pacienteId } = validada.data;
  if (resultado.estado !== 'no_disponible' || notaId === null) return resultado;

  const lectura = await notasParaCopia(sesion, pacienteId);
  const nota = lectura.ok ? lectura.valor.find((n) => n.id === notaId) : undefined;
  return nota ? { estado: 'solo_copia', nota } : resultado;
}

export async function guardarBorrador(entrada: {
  pacienteId: string;
  notaId: string;
  testigo: string;
  texto: string;
  reservadas: string;
}): Promise<servidor.ResultadoGuardado> {
  const sesion = await exigirSesion();
  const validada = esquemaBorrador.safeParse(entrada);
  if (!validada.success) return { ok: false, motivo: 'error' };
  return servidor.guardarBorrador(sesion, validada.data);
}

export async function fijarCoprofesional(entrada: {
  pacienteId: string;
  notaId: string;
  coprofesionalId: string | null;
}): Promise<servidor.ResultadoDeNota> {
  const sesion = await exigirSesion();
  const validada = esquemaCoprofesional.safeParse(entrada);
  if (!validada.success) return { ok: false, motivo: 'error' };
  return servidor.fijarCoprofesional(sesion, validada.data);
}

export async function empezarModificacion(entrada: {
  pacienteId: string;
  notaId: string;
}): Promise<servidor.ResultadoDeNota> {
  const sesion = await exigirSesion();
  const validada = esquemaModificar.safeParse(entrada);
  if (!validada.success) return { ok: false, motivo: 'error' };
  return servidor.empezarModificacion(sesion, validada.data);
}

export async function firmarNota(entrada: {
  pacienteId: string;
  notaId: string;
  testigo: string;
  alcance: 'individual' | 'conjunta';
  motivo: string | null;
}): Promise<servidor.ResultadoDeNota> {
  const sesion = await exigirSesion();
  const validada = esquemaFirma.safeParse(entrada);
  if (!validada.success) return { ok: false, motivo: 'error' };
  return servidor.firmarNota(sesion, validada.data);
}
