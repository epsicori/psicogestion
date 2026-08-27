// Número de colegiado.
//
// Aquí NO hay expresión regular, a propósito: cada colegio profesional
// autonómico numera a su manera (con prefijos, letras de sección, años…), y
// ninguna regla nuestra va a describirlos todos. Cualquier patrón que se
// escriba hoy rechazaría colegiados válidos mañana. Lo único que se puede
// exigir sin conocer el colegio es que el dato esté limpio y tenga una
// longitud razonable.

const LONGITUD_MAXIMA = 50;

/** Recorta los extremos y colapsa los espacios interiores en uno solo. */
export function sanearColegiado(valor: string): string {
  return valor.trim().replace(/\s+/g, ' ');
}

export function validarColegiado(valor: string): boolean {
  if (typeof valor !== 'string') return false;

  const saneado = sanearColegiado(valor);
  return saneado.length >= 1 && saneado.length <= LONGITUD_MAXIMA;
}
