'use server';

import { revalidatePath } from 'next/cache';

import { exigirSesion } from '@/lib/supabase/sesion';

import { esquemaResolverAlerta } from './esquema-alertas';

export type EstadoResolver =
  | { ok: true }
  | { ok: false; error: 'invalida' | 'no_permitida' | 'fallo' }
  | null;

/**
 * Marca como resuelta una alerta de documentación (T-015, decisión P1). Quién puede lo decide la
 * política de update de `alertas_documentacion`; que una `nota_sin_firmar` solo se cierre
 * firmando, el disparador `proteger_alerta_documentacion`. El `neq` de aquí es cinturón, no la
 * garantía. `resuelta_en` lo pone la base (`now()`), no este valor.
 *
 * Cero filas (ajena, ya resuelta, inexistente o nota sin firmar) y 42501 dan lo mismo,
 * `no_permitida`: no se distingue cuál, para no hacer de oráculo.
 */
export async function resolverAlerta(_previo: EstadoResolver, datos: FormData): Promise<EstadoResolver> {
  const { supabase } = await exigirSesion();

  const validado = esquemaResolverAlerta.safeParse({ alertaId: datos.get('alertaId') });
  if (!validado.success) return { ok: false, error: 'invalida' };

  const { data, error } = await supabase
    .from('alertas_documentacion')
    .update({ estado: 'resuelta', resuelta_en: new Date().toISOString() })
    .eq('id', validado.data.alertaId)
    .eq('estado', 'abierta')
    .neq('tipo', 'nota_sin_firmar')
    .select('id');

  if (error) {
    if (error.code === '42501') return { ok: false, error: 'no_permitida' };
    console.error('resolverAlerta: fallo al actualizar alertas_documentacion', error);
    return { ok: false, error: 'fallo' };
  }
  if (!data || data.length === 0) return { ok: false, error: 'no_permitida' };

  revalidatePath('/agenda');
  revalidatePath('/', 'layout');
  return { ok: true };
}
