// T-046 · Los tipos del borrador de factura que comparten el sobre, los importes y el núcleo.
//
// Una línea va en céntimos enteros y con el régimen que MARCÓ el usuario (ADR-053 j): nada de
// deducirlo del tipo de terapia ni del destinatario. `tipo_iva_centesimas` sale del régimen:
// 0 para el exento y 2100 (21,00 %) para el general.
import type { Centimos } from '@/lib/dinero/importe';
import type { RegimenIva } from '@/lib/dinero/iva';

export type TipoIvaCentesimas = 0 | 2100;

/** Una línea tal como va al sobre y a la columna `lineas` (las seis claves de T-021). */
export type LineaBorrador = {
  concepto: string;
  cantidad: number;
  precio_unitario_centimos: Centimos;
  regimen_iva: RegimenIva;
  tipo_iva_centesimas: TipoIvaCentesimas;
  cita_id: string | null;
};

/** El NIF del destinatario ya cifrado, en base64 sin saltos; o `null` si no lleva. */
export type NifCifrado = { cifrado: string; nonce: string; etiqueta: string } | null;

/** El tipo que corresponde a cada régimen. Sin tercer valor: un régimen desconocido lanza. */
export function tipoIvaDe(regimen: RegimenIva): TipoIvaCentesimas {
  if (regimen === 'exento_sanitario') return 0;
  if (regimen === 'general') return 2100;
  throw new Error(`Régimen de IVA desconocido: '${String(regimen)}'.`);
}
