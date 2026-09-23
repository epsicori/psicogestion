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
 * REGLA ÚNICA DE REDONDEO del dinero: **media al alza** (`0,5` céntimo sube).
 * Se aplica aquí y solo aquí; quien calcule porcentajes o divisiones pasa el
 * resultado por esta función UNA vez, al final. Redondear dos veces en dos
 * pasos distintos es como se pierde el céntimo.
 */
export function redondearCentimos(valor: number): Centimos {
  return Math.round(valor);
}

const FORMATEADOR_EUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

/** `1250` → `'12,50 €'`. Formato español vía `Intl`, no un `replace` a mano. */
export function formatearImporte(centimos: Centimos): string {
  return FORMATEADOR_EUR.format(centimos / 100);
}

const PATRON_ENTEROS = /^(\d+)$/;
const PATRON_DECIMALES = /^(\d+)[.,](\d{1,2})$/;
const PATRON_MILLARES = /^\d{1,3}(\.\d{3})+$/;
// Con coma decimal, si hay puntos han de agrupar de tres en tres desde el
// principio ('1.234,50', '12.345.678,90'): un punto que no cierra un grupo
// de tres ('1.23,50', '12.3456,00', '.123,00') no es un millar mal escrito,
// es un importe distinto del que se tecleó, y se rechaza.
const PATRON_MILLARES_CON_DECIMALES = /^\d{1,3}(\.\d{3})+,\d{1,2}$/;
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
 * Se acepta signo menos (`'-5,00'` → devolución). Se rechaza con excepción
 * todo lo que no es un importe: `'doce'`, `''`, `'12,5,0'`.
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

  if (centimos === null) {
    throw new Error(`No es un importe: '${texto}'.`);
  }
  return negativo ? -centimos : centimos;
}
