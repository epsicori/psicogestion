// T-026a, Q4. El concepto que viaja al programa de facturación es genérico y sale SOLO de aquí,
// por régimen de IVA: lo que el profesional escribió en la línea (el concepto libre, la cita) no sale
// de la base de datos hacia el programa (ADR-053, ADR-077).

import type { RegimenIva } from '@/lib/dinero/iva';

import type { ConceptoGenerico } from './proveedor';

const CONCEPTOS: Record<RegimenIva, ConceptoGenerico> = {
  exento_sanitario: 'Sesión de psicología',
  general: 'Servicios profesionales de psicología',
};

export function conceptoGenerico(regimen: RegimenIva): ConceptoGenerico {
  return CONCEPTOS[regimen];
}
