// T-046 · Los importes del borrador, en céntimos enteros de punta a punta (CA9, D15).
//
// La cuota del 21 % se calcula UNA vez sobre la suma de las líneas generales, desglosada desde
// el total (lo tecleado es precio con IVA), y nunca línea a línea: línea a línea, el redondeo de
// cada una puede sacar la cuota de la banda que exige el sellado (T-021). base = total − cuota,
// así que base + cuota = total exacto.
import { comprobarCentimos, type Centimos } from '@/lib/dinero/importe';
import { desglosarDesdeTotal } from '@/lib/dinero/iva';

import type { LineaBorrador } from './tipos';

/**
 * El importe general es de 1 o 2 céntimos: su cuota redondeada (0) cae fuera de la banda del
 * sellado (A4-H1). La aplicación lo rechaza con su propio mensaje en vez de llegar a la base.
 */
export class ErrorCuotaMinima extends Error {
  constructor() {
    super('El importe al 21 % es demasiado pequeño para calcular su cuota (A4-H1).');
    this.name = 'ErrorCuotaMinima';
  }
}

const PATRON_NUMERIC_2 = /^(\d+)\.(\d{2})$/;

/**
 * El texto de un `numeric(…, 2)` tal como lo sirve Postgres con `::text` (`'60.00'`) → céntimos.
 * Sin pasar por un flotante: se concatenan las cifras. Cualquier otra forma lanza.
 */
export function centimosDeNumeric(texto: string): Centimos {
  const m = PATRON_NUMERIC_2.exec(texto);
  if (!m) {
    throw new Error(`No es un importe numeric con dos decimales: '${texto}'.`);
  }
  const centimos = Number.parseInt(m[1] + m[2], 10);
  comprobarCentimos(centimos, 'El importe');
  return centimos;
}

export function calcularImportes(lineas: LineaBorrador[]): {
  base: Centimos;
  cuota: Centimos;
  total: Centimos;
} {
  let total = 0;
  let general = 0;
  for (const l of lineas) {
    comprobarCentimos(l.precio_unitario_centimos, 'El precio');
    if (!Number.isSafeInteger(l.cantidad) || l.cantidad < 1) {
      throw new Error(`La cantidad ha de ser un entero positivo: '${l.cantidad}'.`);
    }
    const importe = l.cantidad * l.precio_unitario_centimos;
    total += importe;
    if (l.regimen_iva === 'general') general += importe;
  }
  comprobarCentimos(total, 'El total');
  if (general > 0 && general <= 2) throw new ErrorCuotaMinima();
  const cuota = general > 0 ? desglosarDesdeTotal(general, 'general').cuota : 0;
  return { base: total - cuota, cuota, total };
}
