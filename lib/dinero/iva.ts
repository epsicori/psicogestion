// Desglose de un importe según su régimen de IVA. Aritmética para enseñar
// importes y preparar borradores: Psicogestión NO expide facturas (ADR-053).
//
// Lo decidido fuera, que este módulo no rediscute:
// - Los regímenes son los dos valores del enum `regimen_iva` (T-021):
//   `exento_sanitario` y `general`. El general es el 21 %.
// - El régimen lo MARCA el usuario; no se infiere del tipo de servicio
//   (ADR-053 j). Aquí entra como parámetro y se calcula. Nada de mirar el
//   tipo de terapia para «deducir» el impuesto.
//
// LA DECISIÓN QUE NO QUEDA IMPLÍCITA: **el precio que se teclea es el precio
// final, CON IVA incluido** — lo que paga el cliente, como en cualquier
// escaparate. Por eso `desglosarDesdeTotal` es la operación principal;
// `desglosarDesdeBase` existe para quien presupueste «base más IVA».
//
// REDONDEO: una sola vez y siempre en el mismo sitio —`redondearCentimos`,
// media lejos del cero, en `importe.ts`—. Por eso una devolución (importe
// negativo) se desglosa como el opuesto exacto de su cargo. La cuota se calcula redondeando la base
// por el tipo; en el desglose desde el total, la base se redondea y la cuota
// es la diferencia, así que **base + cuota = total exacto** siempre.
import { comprobarCentimos, redondearCentimos, type Centimos } from './importe';

/** Los dos valores del enum `regimen_iva`, con sus nombres reales. */
export type RegimenIva = 'exento_sanitario' | 'general';

export const TIPO_IVA_GENERAL = 21;

export interface DesgloseIva {
  regimen: RegimenIva;
  base: Centimos;
  cuota: Centimos;
  total: Centimos;
  /**
   * `21` para el régimen general, `null` para el exento: no es «21 % sobre
   * cero», es que NO HAY impuesto (art. 20.Uno.3.º LIVA), y el desglose debe
   * poder decirlo — una factura exenta lleva la mención del artículo.
   */
  tipoImpositivo: number | null;
}

function desgloseExento(importe: Centimos): DesgloseIva {
  return {
    regimen: 'exento_sanitario',
    base: importe,
    cuota: 0,
    total: importe,
    tipoImpositivo: null,
  };
}

/**
 * Un régimen que no es ninguno de los dos valores del enum NO cae al 21 %
 * general por defecto: es un error. Un dato corrupto, un typo en un `as
 * RegimenIva` o un tercer valor que añada una migración futura tiene que
 * lanzar, no facturar en silencio.
 */
function comprobarRegimenConocido(regimen: RegimenIva): void {
  if (regimen !== 'exento_sanitario' && regimen !== 'general') {
    throw new Error(`Régimen de IVA desconocido: '${regimen}'.`);
  }
}

/** Desglose partiendo de la base (precio SIN IVA): cuota = base × tipo, redondeada una vez. */
export function desglosarDesdeBase(base: Centimos, regimen: RegimenIva): DesgloseIva {
  comprobarCentimos(base, 'La base');
  comprobarRegimenConocido(regimen);
  if (regimen === 'exento_sanitario') {
    return desgloseExento(base);
  }
  const cuota = redondearCentimos((base * TIPO_IVA_GENERAL) / 100);
  return {
    regimen,
    base,
    cuota,
    total: base + cuota,
    tipoImpositivo: TIPO_IVA_GENERAL,
  };
}

/**
 * Desglose partiendo del total (precio CON IVA, lo que se teclea): la base se
 * redondea una vez y la cuota es la diferencia, para que base + cuota sea
 * exactamente el total.
 */
export function desglosarDesdeTotal(total: Centimos, regimen: RegimenIva): DesgloseIva {
  comprobarCentimos(total, 'El total');
  comprobarRegimenConocido(regimen);
  if (regimen === 'exento_sanitario') {
    return desgloseExento(total);
  }
  const base = redondearCentimos((total * 100) / (100 + TIPO_IVA_GENERAL));
  return {
    regimen,
    base,
    cuota: total - base,
    total,
    tipoImpositivo: TIPO_IVA_GENERAL,
  };
}
