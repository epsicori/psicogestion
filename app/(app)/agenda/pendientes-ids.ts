/**
 * Identificadores del DOM que comparten la fila de paciente y el proveedor del foco (T-048).
 * Puro y sin dependencias, para que el cliente no arrastre `bloques.ts`. El prefijo distingue
 * el panel de /agenda, la página y los resultados de la búsqueda, que pueden coexistir.
 */
export type Prefijo = 'panel' | 'pagina' | 'busqueda';

export const idEnlacePaciente = (p: Prefijo, pacienteId: string) => `${p}-paciente-${pacienteId}`;
export const idListaPendientes = (p: Prefijo, pacienteId: string) => `${p}-pendientes-${pacienteId}`;
export const idResumen = (p: Prefijo, pacienteId: string) => `${p}-resumen-${pacienteId}`;
