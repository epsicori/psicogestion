// Código postal español: cinco dígitos cuyos dos primeros son la provincia,
// entre 01 y 52.
//
// Es TEXTO, jamás un número: los ceros a la izquierda son significativos
// (`01001` es A Coruña) y se conservan tal cual. Aquí solo va el código de
// provincia; los nombres son cadenas de interfaz y pertenecen al catálogo de
// i18n de T-009, no a este módulo.

const FORMATO_CODIGO_POSTAL = /^\d{5}$/;

export function validarCodigoPostal(valor: string): boolean {
  if (typeof valor !== 'string') return false;
  if (!FORMATO_CODIGO_POSTAL.test(valor)) return false;

  const provincia = Number(valor.slice(0, 2));
  return provincia >= 1 && provincia <= 52;
}

/** Código de provincia (dos dígitos, con el cero inicial), o null si no valida. */
export function provinciaDeCodigoPostal(valor: string): string | null {
  return validarCodigoPostal(valor) ? valor.slice(0, 2) : null;
}
