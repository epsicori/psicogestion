import 'server-only';

import { mapearErrorCitas, mensajeParaMotivo } from './errores';
import type { DatosDesplazarCita } from './esquemas';
import type { ResultadoCitas, Sesion } from './tipos';

/**
 * Reprograma o cambia el estado de una cita SUELTA (sin serie, o «esta» sin
 * pasar por `editarSerie()`). Envuelve `agenda_actualizar_cita()` de T-010:
 * no hay un segundo camino de escritura de citas, y esta función es ese
 * único camino visto desde TypeScript. Si la cita pertenece a una serie y se
 * mueve `inicio`/`fin`/zona, queda `desviada` — lo hace el disparador
 * `marcar_cita_desviada`, no esta función.
 */
export async function desplazarCita(
  sesion: Sesion,
  entrada: DatosDesplazarCita,
): Promise<ResultadoCitas<{ citaId: string }>> {
  const { data, error } = await sesion.supabase.rpc('agenda_actualizar_cita', {
    p_cita_id: entrada.citaId,
    p_estado: entrada.estado ?? undefined,
    p_sala: entrada.sala ?? undefined,
    p_inicio: entrada.inicio ?? undefined,
    p_fin: entrada.fin ?? undefined,
  });

  if (error) {
    console.error('desplazarCita: agenda_actualizar_cita() falló', error);
    const motivo = mapearErrorCitas(error);
    return { ok: false, motivo, mensaje: mensajeParaMotivo(motivo) };
  }

  return { ok: true, citaId: data as string };
}
