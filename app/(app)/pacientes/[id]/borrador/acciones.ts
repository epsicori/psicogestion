'use server';

import { revalidatePath } from 'next/cache';

import { guardarBorrador } from '@/lib/economico/borrador';
import type { ResultadoGuardar } from '@/lib/economico/entrada';
import { exigirSesion } from '@/lib/supabase/sesion';

import { depsDeSesion } from './datos';
import { esquemaBorrador, esquemaDescartar } from './esquemas';

/**
 * Las acciones del editor del borrador (T-046). `datos` es `unknown`: una Server Action es un punto
 * de entrada público, y el esquema que valida aquí es EL MISMO del formulario. `creada_por` sale de
 * la sesión y `creada_en` del reloj del servidor. Devuelven **solo** `ResultadoGuardar`: ni filas ni
 * NIF. Sin `redirect`: el editor dice «Guardado: versión N» y enlaza a la ficha.
 */
async function guardarYRefrescar(entrada: { pacienteId: string }): Promise<ResultadoGuardar> {
  const resultado = await guardarBorrador(await depsDeSesion(), entrada);
  if (resultado.ok) revalidatePath(`/pacientes/${entrada.pacienteId}`);
  return resultado;
}

export async function guardarBorradorAccion(datos: unknown): Promise<ResultadoGuardar> {
  await exigirSesion();
  const parseo = esquemaBorrador.safeParse(datos);
  if (!parseo.success) return { ok: false, error: 'validacion' };
  return guardarYRefrescar(parseo.data);
}

export async function descartarBorradorAccion(datos: unknown): Promise<ResultadoGuardar> {
  await exigirSesion();
  const parseo = esquemaDescartar.safeParse(datos);
  if (!parseo.success) return { ok: false, error: 'validacion' };
  return guardarYRefrescar(parseo.data);
}
