// T-005 · `redactada_en_sesion` (ADR-046), sin tabla de `citas`.
//
// Función pura: no conoce el esquema ni la base de datos. Cuando llegue el
// ticket de agenda, lo único que cambia es quién rellena `ventanaCita` y
// `margenMinutos` al llamar a `construirSobre()` (sobre.ts). La forma de este
// cálculo no cambia y `esquema_version` no sube por eso.

export interface ParametrosRedactadaEnSesion {
  abiertaEn: Date;
  firmadaEn: Date;
  ventanaCita: { inicio: Date; fin: Date } | null;
  margenMinutos: number | null;
}

/**
 * Cierto si y solo si hay ventana y margen, y `abiertaEn` y `firmadaEn` caen
 * dentro de la ventana de la cita ampliada por el margen a cada lado
 * (ADR-046: «con el margen que aplicó»).
 */
export function calcularRedactadaEnSesion(p: ParametrosRedactadaEnSesion): boolean {
  if (p.ventanaCita === null || p.margenMinutos === null) return false;

  const margenMs = p.margenMinutos * 60_000;
  const inicioConMargen = p.ventanaCita.inicio.getTime() - margenMs;
  const finConMargen = p.ventanaCita.fin.getTime() + margenMs;

  return p.abiertaEn.getTime() >= inicioConMargen && p.firmadaEn.getTime() <= finConMargen;
}
