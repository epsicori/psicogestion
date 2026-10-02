/**
 * «Notas» abre el editor de la nota de la sesión. T-012 creó la ruta, así que el botón se
 * pinta (D8: un enlace a un 404 sería un control sin acción real).
 */
export const RUTA_NOTAS_DISPONIBLE = true;

/** Solo uuids en la URL: nunca el nombre del paciente. */
export function rutaNotas(pacienteId: string, citaId: string): string {
  return `/pacientes/${pacienteId}/historia/notas?cita=${citaId}`;
}
