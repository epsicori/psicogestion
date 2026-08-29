// Teléfono español: nueve dígitos, móvil si empieza por 6 o 7, fijo por 8 o 9.
// Se admite prefijo internacional +34 o 0034 (o ninguno) y espacios o guiones
// por medio.

export type TipoTelefono = 'movil' | 'fijo';

/** Devuelve los nueve dígitos nacionales, o null si la entrada no tiene esa forma. */
function extraerNumeroNacional(valor: string): string | null {
  if (typeof valor !== 'string') return null;

  const limpio = valor.replace(/[\s-]/g, '');
  const sinPrefijo = limpio.startsWith('+34')
    ? limpio.slice(3)
    : limpio.startsWith('0034')
      ? limpio.slice(4)
      : limpio;

  return /^\d{9}$/.test(sinPrefijo) ? sinPrefijo : null;
}

export function tipoTelefono(valor: string): TipoTelefono | null {
  const nacional = extraerNumeroNacional(valor);
  if (nacional === null) return null;

  const inicial = nacional[0];
  if (inicial === '6' || inicial === '7') return 'movil';
  if (inicial === '8' || inicial === '9') return 'fijo';
  return null;
}

export function validarTelefono(valor: string): boolean {
  return tipoTelefono(valor) !== null;
}

/**
 * E.164 (`+34600000000`): es el formato que necesita `wa.me` (decisión 11),
 * que no admite espacios ni el `00` internacional. Devuelve null si no valida.
 */
export function normalizarTelefono(valor: string): string | null {
  const nacional = extraerNumeroNacional(valor);
  if (nacional === null || tipoTelefono(valor) === null) return null;
  return `+34${nacional}`;
}

/** Forma legible para pintar en pantalla (`600 000 000`), o null si no valida. */
export function formatearTelefono(valor: string): string | null {
  const nacional = extraerNumeroNacional(valor);
  if (nacional === null || tipoTelefono(valor) === null) return null;
  return `${nacional.slice(0, 3)} ${nacional.slice(3, 6)} ${nacional.slice(6)}`;
}
