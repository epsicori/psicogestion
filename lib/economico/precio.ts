// T-046 · El precio y el régimen que se PROPONEN para una línea de sesión (CA8, CA10).
//
// Misma regla que `importe_cita()` en la base (T-023): la tarifa del paciente para el tipo de
// terapia con `vigente_desde <= día local de la cita`, la más reciente y, a igualdad, la de
// `orden` mayor. Esa tarifa da precio Y régimen. Sin tarifa, el precio sale de
// `tipos_terapia.tarifa_base` y el régimen queda SIN MARCAR: el usuario lo marca (ADR-053 j).
// `tipos_terapia.regimen` no se lee nunca: tiene un valor por defecto que nadie eligió.
import type { Centimos } from '@/lib/dinero/importe';
import type { RegimenIva } from '@/lib/dinero/iva';

import { centimosDeNumeric } from './importes';

/** Una fila de `tarifas_paciente` leída con `importe::text`. */
export type TarifaLeida = {
  tipo_terapia_id: string;
  importe: string;
  regimen_iva: RegimenIva;
  vigente_desde: string;
  orden: number;
};

export type CitaParaPrecio = { inicio: string; zona_horaria: string; tipo_terapia_id: string };

export type Propuesta = { precioCentimos: Centimos | null; regimen: RegimenIva | null };

/**
 * El día (`AAAA-MM-DD`) en que cae un instante en una zona IANA. Es un instante concreto, no un
 * `date` anclado: no hay medianoche que elegir. `en-CA` formatea como `AAAA-MM-DD`.
 */
export function fechaLocal(inicio: string, zona: string): string {
  const instante = new Date(inicio);
  if (Number.isNaN(instante.getTime())) {
    throw new Error(`Instante no válido: '${inicio}'.`);
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

export function proponerLinea(
  cita: CitaParaPrecio,
  tarifas: TarifaLeida[],
  tipo: { tarifa_base: string | null } | null,
): Propuesta {
  const dia = fechaLocal(cita.inicio, cita.zona_horaria);
  // Las fechas `AAAA-MM-DD` se ordenan como texto igual que como fechas.
  const vigente = tarifas
    .filter((t) => t.tipo_terapia_id === cita.tipo_terapia_id && t.vigente_desde <= dia)
    .sort((a, b) =>
      a.vigente_desde === b.vigente_desde
        ? b.orden - a.orden
        : a.vigente_desde < b.vigente_desde
          ? 1
          : -1,
    )[0];

  if (vigente) {
    return { precioCentimos: centimosDeNumeric(vigente.importe), regimen: vigente.regimen_iva };
  }
  if (tipo?.tarifa_base != null) {
    const base = centimosDeNumeric(tipo.tarifa_base);
    // Una tarifa base de 0,00 no se propone: el precio va de 1 céntimo en adelante (D16).
    return { precioCentimos: base > 0 ? base : null, regimen: null };
  }
  return { precioCentimos: null, regimen: null };
}
