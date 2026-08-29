import { normalizarNif } from './nif';

// NIF de persona jurídica (CIF): inicial de organización, siete dígitos y un
// carácter de control. La inicial decide si el control es letra, dígito o ambos:
//   · N, P, Q, R, S, U, W → siempre letra
//   · A, B, E, H          → siempre dígito
//   · C, D, F, G, J, V    → se acepta cualquiera de las dos formas
const INICIALES_QUE_EXIGEN_LETRA = 'NPQRSUW';
const INICIALES_QUE_EXIGEN_DIGITO = 'ABEH';

// El dígito de control 0-9 se representa como letra con esta tabla (0 → J).
const LETRAS_DE_CONTROL = 'JABCDEFGHI';

const FORMATO_CIF = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/;

/** La limpieza del CIF es la misma que la del NIF: mayúsculas sin separadores. */
export const normalizarCif = normalizarNif;

export function validarCif(valor: string): boolean {
  if (typeof valor !== 'string') return false;

  const cif = normalizarCif(valor);
  const coincidencia = FORMATO_CIF.exec(cif);
  if (!coincidencia) return false;

  const [, inicial, digitos, control] = coincidencia;

  // Posiciones impares (1ª, 3ª, 5ª, 7ª) se duplican y se suman sus dígitos;
  // las pares se suman tal cual.
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    const digito = Number(digitos[i]);
    if (i % 2 === 0) {
      const doble = digito * 2;
      suma += Math.floor(doble / 10) + (doble % 10);
    } else {
      suma += digito;
    }
  }

  const digitoControl = (10 - (suma % 10)) % 10;

  if (INICIALES_QUE_EXIGEN_LETRA.includes(inicial)) {
    return control === LETRAS_DE_CONTROL[digitoControl];
  }
  if (INICIALES_QUE_EXIGEN_DIGITO.includes(inicial)) {
    return control === String(digitoControl);
  }
  return control === String(digitoControl) || control === LETRAS_DE_CONTROL[digitoControl];
}
