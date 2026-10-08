'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { exigirSesion } from '@/lib/supabase/sesion';

/**
 * Preparar un borrador en el programa de facturación (T-026a). Solo encola: el envío lo hace el
 * drenado, y la app **nunca** aprueba ni expide (ADR-053).
 *
 * La guarda de verdad es `encolar_envio_borrador`: administrador, o profesional autor del borrador
 * y asignado al paciente. El error se elige por el código SQL y por un fragmento del mensaje, que
 * es el contrato con la función; el texto de la base no sale de aquí.
 */
export type ErrorDePreparacion = 'sin_permiso' | 'sin_programa' | 'no_preparable' | 'fallo';
export type ResultadoDePreparacion = { ok: true } | { error: ErrorDePreparacion };

const esquemaBorrador = z.uuid();

export async function prepararBorradorEnProveedor(borradorId: unknown): Promise<ResultadoDePreparacion> {
  const { supabase } = await exigirSesion();

  const id = esquemaBorrador.safeParse(borradorId);
  if (!id.success) return { error: 'fallo' };

  const { error } = await supabase.rpc('encolar_envio_borrador', { p_borrador_id: id.data });
  if (error) {
    if (error.code === '42501') return { error: 'sin_permiso' };
    if (error.code === '23514') {
      if (error.message.includes('no hay programa')) return { error: 'sin_programa' };
      if (error.message.includes('se pueda preparar')) return { error: 'no_preparable' };
    }
    return { error: 'fallo' };
  }

  // El paciente se lee ya con la RLS de quien actúa; si no se pudiera leer, la ficha se
  // refresca igual en la siguiente visita.
  const { data: cabecera } = await supabase
    .from('borradores_factura')
    .select('paciente_id')
    .eq('id', id.data)
    .maybeSingle();
  if (cabecera) revalidatePath('/pacientes/' + cabecera.paciente_id);

  return { ok: true };
}

/** Para `<form action>`: React exige que la acción de un formulario no devuelva nada. */
export async function prepararDesdeFormulario(borradorId: string): Promise<void> {
  await prepararBorradorEnProveedor(borradorId);
}
