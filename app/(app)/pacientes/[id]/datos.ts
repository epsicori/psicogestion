import 'server-only';

import { cache } from 'react';

import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { exigirSesion } from '@/lib/supabase/sesion';

/**
 * Lecturas de la ficha del paciente, memoizadas POR PETICIÓN con `cache()` de React.
 *
 * NUNCA `use cache` (ADR-043): guardaría el resultado entre peticiones y le serviría a un
 * profesional el paciente de otro. Ni siquiera `use cache: private`.
 *
 * **Aquí no se lee nada de lo que el candado tapa.** El motivo de consulta, los episodios,
 * los diagnósticos y el nivel de riesgo viven detrás de `historia_desbloqueada()` y llegan
 * por la Server Action de apertura (ADR-056), que es la que deja la fila en
 * `accesos_historia`. Traerlos aquí sería la segunda puerta del choque 11.
 */

export type DatosDeCabecera = {
  id: string;
  nombre: string;
  apellidos: string;
  creadoEn: string;
  fechaNacimiento: string | null;
  centro: string | null;
};

/** Nulo si el paciente no existe **o si RLS no deja verlo**: para la pantalla es lo mismo. */
export const cargarPaciente = cache(async (id: string): Promise<DatosDeCabecera | null> => {
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nombre, apellidos, creado_en, fecha_nacimiento, centros(nombre)')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('cargarPaciente: fallo al leer el paciente', error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    nombre: data.nombre,
    apellidos: data.apellidos,
    creadoEn: data.creado_en,
    fechaNacimiento: data.fecha_nacimiento,
    centro: data.centros?.nombre ?? null,
  };
});

/** El rol de quien mira. Lo decide la base (`rol_actual()`), no una cookie ni una prop. */
export const cargarRol = cache(async () => {
  const sesion = await exigirSesion();
  return (await estadoDeCuenta(sesion))?.rol ?? null;
});

export type IndicadorDeRiesgo = { indicador: boolean; valoradoEn: string } | null;

/**
 * El indicador binario del técnico administrativo, y **solo suyo**: la vista
 * `pacientes_indicador_riesgo` filtra por `rol_actual() = 'tecnico_administrativo'` a
 * propósito, para que profesional y administrador sigan leyendo el nivel por la tabla, con
 * su política y su candado. Llamarla siendo otra cosa devuelve vacío, no un error.
 */
export const cargarIndicadorDeRiesgo = cache(async (id: string): Promise<IndicadorDeRiesgo> => {
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase
    .from('pacientes_indicador_riesgo')
    .select('indicador, valorado_en')
    .eq('paciente_id', id)
    .order('valorado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('cargarIndicadorDeRiesgo: fallo al leer el indicador', error);
    return null;
  }
  if (!data || data.indicador === null || data.valorado_en === null) return null;

  return { indicador: data.indicador, valoradoEn: data.valorado_en };
});
