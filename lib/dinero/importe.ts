// Los importes viven en CÉNTIMOS, como enteros. Nada de `number` con
// decimales para dinero: `0.1 + 0.2` no es `0.3`, y con euros eso es un
// céntimo que aparece o desaparece. Este módulo es el único sitio donde se
// entra (texto tecleado → céntimos) y se sale (céntimos → texto español).
//
// Coherencia de errores en todo `lib/dinero/`: lo que no es un importe válido
// LANZA `Error` con mensaje en castellano. Nunca se devuelve `NaN` callando.

/** Un importe en céntimos de euro. Entero: 1250 son 12,50 €. */
export type Centimos = number;

/**
 * REGLA ÚNICA DE REDONDEO del dinero: **media lejos del cero** (`10,5` → `11`,
 * `-10,5` → `-11`). En positivos es la media al alza de siempre; en negativos
 * es su espejo, para que una devolución se desglose como el opuesto exacto de
 * su cargo. `Math.round` llevaría `-10,5` a `-10`, y cargo más devolución
 * dejaría un céntimo que nadie ha cobrado.
 *
 * Se aplica aquí y solo aquí; quien calcule porcentajes o divisiones pasa el
 * resultado por esta función UNA vez, al final. Redondear dos veces en dos
 * pasos distintos es como se pierde el céntimo. Nunca devuelve `-0`.
 */
export function redondearCentimos(valor: number): Centimos {
  return Math.sign(valor) * Math.round(Math.abs(valor)) + 0;
}

/**
 * Lanza si `valor` no es un importe en céntimos: un entero exacto (seguro en
 * coma flotante). `que` nombra el dato en el mensaje: `'El total'`.
 */
export function comprobarCentimos(valor: number, que: string): void {
  if (!Number.isSafeInteger(valor)) {
    throw new Error(`${que} ha de ser un entero en céntimos: '${valor}'.`);
  }
}

const FORMATEADOR_EUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

/** `1250` → `'12,50 €'`. Formato español vía `Intl`, no un `replace` a mano. */
export function formatearImporte(centimos: Centimos): string {
  comprobarCentimos(centimos, 'El importe');
  // `+ 0` convierte un `-0` en `0`: Intl pintaría '-0,00 €'.
  return FORMATEADOR_EUR.format((centimos + 0) / 100);
}

const PATRON_ENTEROS = /^(\d+)$/;
const PATRON_DECIMALES = /^(\d+)[.,](\d{1,2})$/;
// El primer grupo de millares no empieza por cero: ninguna cifra española en
// millares lo hace, y '0.500' leído como millar serían 500 €, no 0,50 €.
const PATRON_MILLARES = /^[1-9]\d{0,2}(\.\d{3})+$/;
// Con coma decimal, si hay puntos han de agrupar de tres en tres desde el
// principio ('1.234,50', '12.345.678,90'): un punto que no cierra un grupo
// de tres ('1.23,50', '12.3456,00', '.123,00', '0.123,00') no es un millar
// mal escrito, es un importe distinto del que se tecleó, y se rechaza.
const PATRON_MILLARES_CON_DECIMALES = /^[1-9]\d{0,2}(\.\d{3})+,\d{1,2}$/;
const PATRON_SIN_MILLARES_CON_DECIMALES = /^\d+,\d{1,2}$/;

/**
 * Lo que un humano teclea → céntimos: `'12,50'`, `'12.50'`, `'12'`,
 * `' 12,50 € '`, `'1.234,56'`.
 *
 * Regla de la ambigüedad del punto, escrita porque alguien la tendrá que
 * leer: con coma presente, los puntos son millares (`'1.234,56'`). Sin coma,
 * un punto seguido de 1-2 dígitos es decimal (`'12.50'` → 12,50 €) y grupos
 * de tres son millares (`'1.234'` → 1.234 €). Es la lectura española.
 *
 * Se acepta signo menos (`'-5,00'` → devolución; `'-0'` es `0`, no `-0`). Se
 * rechaza con excepción todo lo que no es un importe: `'doce'`, `''`,
 * `'12,5,0'`, y una cifra tan larga que no cabe exacta en céntimos.
 */
export function aCentimos(texto: string): Centimos {
  const limpio = texto.trim().replace(/€\s*$/, '').trim();
  const negativo = limpio.startsWith('-');
  const sinSigno = negativo ? limpio.slice(1).trim() : limpio;

  let centimos: number | null = null;

  if (sinSigno.includes(',')) {
    // Formato español: puntos de millares fuera, coma decimal. Si hay
    // puntos, tienen que agrupar de tres en tres o no es un millar, es un
    // importe distinto (ver PATRON_MILLARES_CON_DECIMALES).
    const millaresValidos = sinSigno.includes('.')
      ? PATRON_MILLARES_CON_DECIMALES.test(sinSigno)
      : PATRON_SIN_MILLARES_CON_DECIMALES.test(sinSigno);
    if (millaresValidos) {
      const sinMillares = sinSigno.replace(/\./g, '');
      const m = PATRON_DECIMALES.exec(sinMillares);
      if (m) {
        centimos = Number(m[1]) * 100 + Number(m[2].padEnd(2, '0'));
      }
    }
  } else if (PATRON_MILLARES.test(sinSigno)) {
    // '1.234' o '1.234.567': punto de millares, sin decimales.
    centimos = Number(sinSigno.replace(/\./g, '')) * 100;
  } else {
    const m = PATRON_DECIMALES.exec(sinSigno) ?? PATRON_ENTEROS.exec(sinSigno);
    if (m) {
      centimos = Number(m[1]) * 100 + (m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0')));
    }
  }

  if (centimos === null || !Number.isSafeInteger(centimos)) {
    throw new Error(`No es un importe: '${texto}'.`);
  }
  return negativo && centimos !== 0 ? -centimos : centimos;
}
