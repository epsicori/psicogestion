/**
 * «Notas» abre el editor de la nota de la sesión, que crea T-012. Mientras esa ruta no
 * exista, el botón no se pinta: un enlace a un 404 es un control sin acción real (D8).
 * T-012 pone esto a `true` en su territorio.
 */
export const RUTA_NOTAS_DISPONIBLE = false;

/** Solo uuids en la URL: nunca el nombre del paciente. */
export function rutaNotas(pacienteId: string, citaId: string): string {
  return `/pacientes/${pacienteId}/historia/notas?cita=${citaId}`;
}
