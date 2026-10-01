import 'server-only';

import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { cache } from 'react';

import { COOKIE_CENTRO } from '@/components/armazon/centro';
import type { RolUsuario } from '@/components/armazon/modulos';
import { zonaDeCentro } from '@/lib/citas/agenda';
import type { ResultadoCitas, Sesion } from '@/lib/citas/tipos';
import { exigirSesion } from '@/lib/supabase/sesion';

import { hoyEn, leerRol, resolverCentro } from './bloques';

/**
 * Lo que todos los bloques de `/agenda` comparten, leído una vez por petición (§1.6.1).
 *
 * `cache()` de React, NUNCA `use cache` (ADR-043): esto es la sesión, el rol y los centros de
 * quien mira. Guardarlo entre peticiones es servirle a un usuario la agenda de otro.
 */

export type CentroOfrecido = { id: string; nombre: string };

export type ContextoAgenda = {
  sesion: Sesion;
  rol: RolUsuario | null;
  centros: CentroOfrecido[];
  /** El centro que filtra, o null: todos. */
  centro: string | null;
  zona: string;
  hoy: string;
  ahora: Date;
};

const cargarSesion = cache(exigirSesion);

/** La misma lectura que el armazón; sin perfil legible, `null`, y el cuadro no se pinta. */
export const cargarRol = cache(async (): Promise<RolUsuario | null> => {
  const { supabase, usuario } = await cargarSesion();
  const { data, error } = await supabase.from('perfiles').select('rol').eq('id', usuario.id).maybeSingle();
  if (error) console.error('Agenda: fallo al leer el rol', error);
  return leerRol(data?.rol);
});

/**
 * Al administrador, todos los centros activos; a los demás, sus centros vigentes, con la
 * consulta del armazón. Un fallo se registra y deja la lista vacía: sin centros ofrecidos no
 * se filtra por centro y la RLS sigue mandando sobre lo que se ve.
 */
const cargarCentros = cache(async (): Promise<CentroOfrecido[]> => {
  await connection();
  const { supabase, usuario } = await cargarSesion();
  const rol = await cargarRol();

  if (rol === 'administrador') {
    const { data, error } = await supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre');
    if (error) console.error('Agenda: fallo al leer los centros', error);
    return data ?? [];
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const { data: pertenencias, error: errorPertenencias } = await supabase
    .from('perfiles_centros')
    .select('centro_id')
    .eq('perfil_id', usuario.id)
    .lte('desde', hoy)
    .or(`hasta.is.null,hasta.gte.${hoy}`);
  if (errorPertenencias || !pertenencias || pertenencias.length === 0) {
    if (errorPertenencias) console.error('Agenda: fallo al leer las pertenencias', errorPertenencias);
    return [];
  }

  const { data, error } = await supabase
    .from('centros')
    .select('id, nombre')
    .in('id', pertenencias.map((p) => p.centro_id))
    .order('nombre');
  if (error) console.error('Agenda: fallo al leer los centros', error);
  return data ?? [];
});

/**
 * Sesión, rol, centros, centro filtrado, zona y el reloj. `centroParametro` es el `?centro` ya
 * validado por `leerParametros` (un uuid, `'todos'` o null).
 */
export const cargarContexto = cache(async (centroParametro: string | null): Promise<ResultadoCitas<ContextoAgenda>> => {
  await connection();
  const sesion = await cargarSesion();
  const [rol, centros, almacen] = await Promise.all([cargarRol(), cargarCentros(), cookies()]);

  const centro = resolverCentro(
    centroParametro,
    almacen.get(COOKIE_CENTRO)?.value,
    centros.map((c) => c.id),
  );
  const zona = await zonaDeCentro(sesion, centro);
  if (!zona.ok) return zona;

  const ahora = new Date();
  return { ok: true, sesion, rol, centros, centro, zona: zona.zona, hoy: hoyEn(ahora, zona.zona), ahora };
});
