// Reparto de un importe en N partes y estado de cobro. Enteros en céntimos,
// como todo `lib/dinero/`.
//
// REPARTO SIN PÉRDIDA: todas las partes son iguales salvo las primeras, que
// se llevan un céntimo más hasta agotar el resto. La suma de las partes es
// EXACTAMENTE el total, siempre: el céntimo que no divide se reparte, no se
// redondea por ningún sitio (la regla de redondeo única es de `importe.ts`;
// aquí no hay fracciones, hay resto entero).
import { comprobarCentimos, type Centimos } from './importe';

/**
 * Reparte `total` en `partes` partes enteras cuya suma es exactamente
 * `total`. El resto (como mucho `partes - 1` céntimos) va un céntimo a cada
 * una de las primeras partes: determinista y sin pérdida.
 *
 * Con totales negativos el resto se reparte en negativo por las primeras
 * partes, con la misma regla. `partes` ha de ser un entero mayor que cero.
 */
export function repartir(total: Centimos, partes: number): Centimos[] {
  if (!Number.isInteger(partes) || partes < 1) {
    throw new Error(`El número de partes ha de ser un entero mayor que cero: '${partes}'.`);
  }
  comprobarCentimos(total, 'El total');
  const base = Math.trunc(total / partes);
  const resto = total - base * partes; // mismo signo que el total, |resto| < partes
  const unidades = Math.abs(resto);
  const ajuste = Math.sign(resto);
  return Array.from({ length: partes }, (_, i) => base + (i < unidades ? ajuste : 0));
}

export type EstadoCobro = 'pendiente' | 'cobrado' | 'cobrado_de_mas';

export interface ResultadoPendiente {
  estado: EstadoCobro;
  /** Lo que falta por cobrar. NUNCA negativo: un cobro de más no lo pone bajo cero. */
  pendiente: Centimos;
  /** Lo cobrado por encima del total. Cero salvo en `cobrado_de_mas`. */
  excedente: Centimos;
}

/**
 * Cuánto queda por cobrar de un total habiendo cobrado `cobrado`.
 * `cobrado del todo` y `cobrado de más` NO son lo mismo: el primero cierra
 * la deuda y el segundo además deja un excedente que la pantalla de cobros
 * (T-023) tiene que poder mostrar.
 */
export function pendiente(total: Centimos, cobrado: Centimos): ResultadoPendiente {
  comprobarCentimos(total, 'El total');
  comprobarCentimos(cobrado, 'Lo cobrado');
  const diferencia = total - cobrado;
  if (diferencia > 0) {
    return { estado: 'pendiente', pendiente: diferencia, excedente: 0 };
  }
  if (diferencia === 0) {
    return { estado: 'cobrado', pendiente: 0, excedente: 0 };
  }
  return { estado: 'cobrado_de_mas', pendiente: 0, excedente: -diferencia };
}
