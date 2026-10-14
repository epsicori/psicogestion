import { diaDeLaSemana, sumarDias, sumarMeses } from '@/lib/fechas/calendario';

/**
 * Funciones puras de la vista anual (T-047 §1.5): los doce meses, los tramos de la escala de
 * densidad y el destino de cada tecla. Sin zona, sin reloj y sin E/S.
 */

export type NivelDensidad = 0 | 1 | 2 | 3 | 4;
export type Tramo = { nivel: 1 | 2 | 3 | 4; desde: number; hasta: number };
export type MesDelAnio = {
  /** 1-12. */
  mes: number;
  /** `AAAA-MM-DD`, todos dentro del mes. */
  dias: string[];
  /** Celdas vacías antes del día 1, con el lunes primero: 0-6. */
  huecos: number;
};

/** Los doce meses de un año natural; cada día aparece una sola vez. */
export function mesesDelAnio(anio: number): MesDelAnio[] {
  const a = String(anio).padStart(4, '0');
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const primero = `${a}-${String(mes).padStart(2, '0')}-01`;
    const dias = [primero];
    for (let d = sumarDias(primero, 1); d.startsWith(primero.slice(0, 8)); d = sumarDias(d, 1)) dias.push(d);
    return { mes, dias, huecos: diaDeLaSemana(primero) - 1 };
  });
}

/** 0 sin citas; si no, `ceil(4n/max)`: el día con el máximo siempre queda en el nivel 4. */
export function nivelDeDensidad(n: number, maximo: number): NivelDensidad {
  if (n <= 0 || maximo <= 0) return 0;
  return Math.min(4, Math.ceil((4 * n) / maximo)) as NivelDensidad;
}

/**
 * Los tramos de la leyenda, calculados sobre el año visible con sus filtros. Los tramos que
 * quedan vacíos (máximos pequeños) no salen.
 */
export function tramosDeDensidad(recuentos: readonly number[]): Tramo[] {
  const max = recuentos.reduce((m, n) => (n > m ? n : m), 0);
  const tramos: Tramo[] = [];
  for (const k of [1, 2, 3, 4] as const) {
    const desde = Math.floor(((k - 1) * max) / 4) + 1;
    const hasta = Math.floor((k * max) / 4);
    if (desde <= hasta) tramos.push({ nivel: k, desde, hasta });
  }
  return tramos;
}

/**
 * A dónde va el foco con cada tecla en el mapa anual (patrón «grid»). `null` si la tecla no es
 * de navegación (el componente no llama a `preventDefault`). Un destino fuera del año es un
 * tope: devuelve la misma fecha. Inicio y Fin respetan la fila visible, que es la semana
 * recortada al mes (los días de otros meses no se pintan).
 */
export function destinoEnAnio(tecla: string, fecha: string, anio: number): string | null {
  let destino: string;
  switch (tecla) {
    case 'ArrowLeft':
      destino = sumarDias(fecha, -1);
      break;
    case 'ArrowRight':
      destino = sumarDias(fecha, 1);
      break;
    case 'ArrowUp':
      destino = sumarDias(fecha, -7);
      break;
    case 'ArrowDown':
      destino = sumarDias(fecha, 7);
      break;
    case 'PageUp':
      destino = sumarMeses(fecha, -1);
      break;
    case 'PageDown':
      destino = sumarMeses(fecha, 1);
      break;
    case 'Home': {
      const lunes = sumarDias(fecha, -(diaDeLaSemana(fecha) - 1));
      destino = lunes.slice(0, 7) === fecha.slice(0, 7) ? lunes : `${fecha.slice(0, 7)}-01`;
      break;
    }
    case 'End': {
      const domingo = sumarDias(fecha, 7 - diaDeLaSemana(fecha));
      destino = domingo.slice(0, 7) === fecha.slice(0, 7) ? domingo : sumarDias(sumarMeses(`${fecha.slice(0, 7)}-01`, 1), -1);
      break;
    }
    default:
      return null;
  }
  return destino.startsWith(`${String(anio).padStart(4, '0')}-`) ? destino : fecha;
}
