// IBAN (ISO 13616): dos letras de país, dos dígitos de control y el BBAN.
// La comprobación mueve los cuatro primeros caracteres al final, convierte las
// letras a números (A=10 … Z=35) y exige que el resto módulo 97 sea 1.
//
// El módulo se calcula dígito a dígito: el resto parcial nunca pasa de 96, así
// que `resto * 10 + d` cabe siempre en un Number sin perder precisión. Usar el
// número entero de golpe (hasta 34 dígitos) lo rompería mucho antes.

// Longitud total del IBAN por país, según el registro oficial de SWIFT.
const LONGITUD_POR_PAIS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30,
  NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22,
  SA: 24, SC: 31, SE: 24, SI: 19, SK: 31, SM: 27, ST: 25, SV: 28, TL: 23,
  TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

const FORMATO_IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/** Forma canónica: mayúsculas y sin espacios. */
export function normalizarIban(valor: string): string {
  return valor.toUpperCase().replace(/\s/g, '');
}

function modulo97(ibanReordenado: string): number {
  let resto = 0;
  for (const caracter of ibanReordenado) {
    const texto = /[A-Z]/.test(caracter)
      ? String(caracter.charCodeAt(0) - 55) // A=10 … Z=35
      : caracter;
    for (const digito of texto) {
      resto = (resto * 10 + Number(digito)) % 97;
    }
  }
  return resto;
}

export function validarIban(valor: string): boolean {
  if (typeof valor !== 'string') return false;

  const iban = normalizarIban(valor);
  if (!FORMATO_IBAN.test(iban)) return false;

  const longitud = LONGITUD_POR_PAIS[iban.slice(0, 2)];
  if (longitud === undefined || iban.length !== longitud) return false;

  return modulo97(iban.slice(4) + iban.slice(0, 4)) === 1;
}
