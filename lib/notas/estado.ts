// T-012 · El estado de una nota se DERIVA; nunca es una columna.

export type EstadoNota = 'borrador' | 'firmada' | 'modificada' | 'firmada_con_cambios';

/**
 * Sin versiones es un borrador (también sin borrador, que no debería existir: una nota sin
 * cabecera no es una nota y una cabecera sin nada no ha firmado nada). Con versiones y un
 * borrador abierto, «firmada con cambios»; sin borrador, «firmada» si hay una sola versión y
 * «modificada» si hay más.
 */
export function estadoDeNota(entrada: { versiones: number; hayBorrador: boolean }): EstadoNota {
  const { versiones, hayBorrador } = entrada;
  if (versiones === 0) return 'borrador';
  if (hayBorrador) return 'firmada_con_cambios';
  return versiones === 1 ? 'firmada' : 'modificada';
}
