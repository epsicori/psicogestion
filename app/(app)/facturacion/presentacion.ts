import type { Centimos } from '@/lib/dinero/importe';
import { pendiente, type EstadoCobro } from '@/lib/dinero/reparto';
import { t } from '@/lib/i18n';

/**
 * Lo que `/facturacion` hace con las filas de `pendiente_paciente` antes de pintarlas (T-023
 * §1.4). Puro y sin E/S.
 */

/** Una fila de la vista tal como la tipa el generador: toda columna de una vista es nullable. */
export type FilaVista = {
  paciente_id: string | null;
  profesional_id: string | null;
  devengado_centimos: number | null;
  cobrado_centimos: number | null;
  pendiente_centimos: number | null;
  excedente_centimos: number | null;
  estado: string | null;
  citas_sin_tarifa: number | null;
};

export type FilaDePendiente = {
  pacienteId: string;
  estado: EstadoCobro;
  /** Pendiente con algo ya cobrado. */
  parcial: boolean;
  pendiente: Centimos;
  excedente: Centimos;
  cobrado: Centimos;
  citasSinTarifa: number;
};

function noNula<T>(valor: T | null, columna: string): T {
  if (valor === null || valor === undefined) {
    throw new Error(`pendiente_paciente: la columna ${columna} ha llegado nula.`);
  }
  return valor;
}

/**
 * Valida la fila y la contrasta con `pendiente()` de `lib/dinero` (D5): la vista calcula el
 * estado en SQL y aquí se recalcula en TypeScript. Si no coinciden es un bug de una de las dos
 * semánticas y **se lanza**: lo recoge el `AvisoDeError` del bloque, no se tapa.
 */
export function aFilaDePendiente(fila: FilaVista): FilaDePendiente {
  const pacienteId = noNula(fila.paciente_id, 'paciente_id');
  noNula(fila.profesional_id, 'profesional_id');
  const devengado = noNula(fila.devengado_centimos, 'devengado_centimos');
  const cobrado = noNula(fila.cobrado_centimos, 'cobrado_centimos');
  const pendienteVista = noNula(fila.pendiente_centimos, 'pendiente_centimos');
  const excedenteVista = noNula(fila.excedente_centimos, 'excedente_centimos');
  const estadoVista = noNula(fila.estado, 'estado');
  const citasSinTarifa = noNula(fila.citas_sin_tarifa, 'citas_sin_tarifa');

  const calculado = pendiente(devengado, cobrado);
  if (
    calculado.estado !== estadoVista ||
    calculado.pendiente !== pendienteVista ||
    calculado.excedente !== excedenteVista
  ) {
    throw new Error('pendiente_paciente: la vista y pendiente() no coinciden.');
  }

  return {
    pacienteId,
    estado: calculado.estado,
    parcial: calculado.estado === 'pendiente' && cobrado > 0,
    pendiente: calculado.pendiente,
    excedente: calculado.excedente,
    cobrado,
    citasSinTarifa,
  };
}

/** Tres tonos y ninguno rojo (el rojo es error de formulario, D12). */
export function pildoraDe(fila: FilaDePendiente): { tono: 'success' | 'warning'; texto: string } {
  switch (fila.estado) {
    case 'cobrado':
      return { tono: 'success', texto: t('cobros.pildora.cobrado') };
    case 'cobrado_de_mas':
      return { tono: 'warning', texto: t('cobros.pildora.cobradoDeMas') };
    case 'pendiente':
      return { tono: 'warning', texto: fila.parcial ? t('cobros.pildora.parcial') : t('cobros.pildora.pendiente') };
  }
}

const RANGO: Record<EstadoCobro, number> = { cobrado_de_mas: 0, pendiente: 1, cobrado: 2 };

/**
 * Primero lo cobrado de más (hay que revisarlo), luego lo pendiente de mayor a menor y al
 * final lo cobrado. No muta la lista.
 */
export function ordenar<T extends FilaDePendiente>(filas: readonly T[]): T[] {
  return [...filas].sort(
    (a, b) => RANGO[a.estado] - RANGO[b.estado] || b.excedente - a.excedente || b.pendiente - a.pendiente,
  );
}

/** La suma de lo pendiente. Un cobro de más no resta: no se compensa entre pacientes. */
export function totalPendiente(filas: readonly FilaDePendiente[]): Centimos {
  return filas.reduce((suma, fila) => suma + fila.pendiente, 0);
}
