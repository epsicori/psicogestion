import type { OpcionDesplegable } from '@/components/ui/desplegable';
import type { Sesion } from '@/lib/cuentas/tipos';

export type CargaDePerfilesActivos = { ok: true; perfiles: OpcionDesplegable[] } | { ok: false };

/**
 * Personas activas a las que el administrador puede aplicar una acción, sin él mismo.
 *
 * Lee `directorio_perfiles`, no `perfiles`: la única política de lectura de `perfiles` es la
 * de la fila propia, y el administrador se vería solo a sí mismo. No filtra por rol: quien
 * decide si la acción procede (p. ej. la baja del último administrador) es la base.
 */
export async function cargarPerfilesActivos(
  supabase: Sesion['supabase'],
  propioId: string,
): Promise<CargaDePerfilesActivos> {
  const { data, error } = await supabase
    .from('directorio_perfiles')
    .select('id, nombre_completo')
    .eq('estado', 'activo')
    .order('nombre_completo');

  if (error) {
    console.error('cargarPerfilesActivos: fallo al leer directorio_perfiles', error);
    return { ok: false };
  }

  const perfiles: OpcionDesplegable[] = [];
  for (const fila of data ?? []) {
    // La vista declara todas sus columnas anulables.
    if (fila.id === null || fila.nombre_completo === null) continue;
    if (fila.id === propioId) continue;
    perfiles.push({ valor: fila.id, etiqueta: fila.nombre_completo });
  }
  return { ok: true, perfiles };
}
