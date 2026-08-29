// DNI, NIE y NIF de persona física.
//
// La letra de control es el resto de dividir el número entre 23, indexando la
// tabla oficial. En el NIE, la inicial X/Y/Z se sustituye por 0/1/2 antes de
// calcular, como manda la norma.
const LETRAS_CONTROL = 'TRWAGMYFPDXBNJZSQVHLCKE';

const SUSTITUCION_NIE: Record<string, string> = { X: '0', Y: '1', Z: '2' };

/**
 * Forma canónica del identificador: mayúsculas, sin espacios, puntos ni guiones.
 *
 * Es la normalización del ADR-029: la forma que alimentará `dni_indice`. NO se
 * puede cambiar nunca sin migrar el índice único, porque dos formas distintas del
 * mismo DNI dejarían de colisionar y el índice dejaría de detectar el alta doble.
 */
export function normalizarNif(valor: string): string {
  return valor.toUpperCase().replace(/[\s.-]/g, '');
}

export function validarNif(valor: string): boolean {
  if (typeof valor !== 'string') return false;

  const nif = normalizarNif(valor);
  let numero: string;
  let letra: string;

  const nie = /^([XYZ])(\d{7})([A-Z])$/.exec(nif);
  if (nie) {
    numero = SUSTITUCION_NIE[nie[1]] + nie[2];
    letra = nie[3];
  } else {
    const dni = /^(\d{8})([A-Z])$/.exec(nif);
    if (!dni) return false;
    numero = dni[1];
    letra = dni[2];
  }

  return LETRAS_CONTROL[Number(numero) % 23] === letra;
}
