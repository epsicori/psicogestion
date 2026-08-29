// Semana de lunes a lunes, calculada en la zona del centro. Son los límites
// que la vista de calendario pedirá a la base de datos, así que se devuelven
// instantes, no cadenas.
import { addDays, startOfWeek } from 'date-fns';
import { tz } from '@date-fns/tz';

export interface LimitesDeSemana {
  inicio: Date;
  fin: Date;
}

/**
 * Lunes 00:00 local de la semana de `fecha` y lunes 00:00 local de la
 * siguiente. El intervalo es semiabierto [inicio, fin), igual que los de
 * cita. Una semana que cruza el cambio de hora no dura 168 horas: dura 167
 * en marzo y 169 en octubre, y esa es la respuesta correcta.
 */
export function limitesDeSemana(fecha: Date, zona: string): LimitesDeSemana {
  const contexto = tz(zona);
  const inicio = startOfWeek(fecha, { in: contexto, weekStartsOn: 1 });
  const fin = addDays(inicio, 7, { in: contexto });
  return { inicio, fin };
}

/** Los siete días de la semana de `fecha`, cada uno a las 00:00 locales. */
export function diasDeSemana(fecha: Date, zona: string): Date[] {
  const contexto = tz(zona);
  const { inicio } = limitesDeSemana(fecha, zona);
  return Array.from({ length: 7 }, (_, i) => addDays(inicio, i, { in: contexto }));
}
