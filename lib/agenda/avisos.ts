// Avisos del armazón (T-015) — módulo puro. Sin reloj propio, sin base de datos, sin React:
// `ahora` llega siempre como parámetro.

import { z } from 'zod';

import { ESTADOS_CITA, estaEnCurso, type EstadoCita } from './estados-cita';

/**
 * Una sesión del propio profesional, serializada: el cliente la recibe en ISO. `desde` y
 * `hasta` son las horas ya formateadas en el servidor, en la zona de la cita (ADR-034): el
 * cliente no formatea horas.
 */
export type SesionPropia = {
  citaId: string;
  pacienteId: string;
  nombrePaciente: string;
  inicio: string;
  fin: string;
  desde: string;
  hasta: string;
  estado: EstadoCita;
};

/** Notas sin firmar del usuario por nivel (`recuento_notas_pendientes()`). */
export type RecuentoNotas = { nivel1: number; nivel2: number; nivel3: number };

/** Cuántas franjas descartadas guarda la cookie como mucho. */
export const MAX_DESCARTADAS = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Las sesiones en curso en `ahora` (ADR-045), por inicio. */
export function sesionesEnCurso(sesiones: SesionPropia[], ahora: Date): SesionPropia[] {
  return sesiones
    .filter((s) =>
      estaEnCurso({ inicio: new Date(s.inicio), fin: new Date(s.fin), estado: s.estado }, ahora),
    )
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}

/** El primer inicio o fin estrictamente posterior a `ahora`: cuándo cambia la franja. */
export function proximoCambio(sesiones: SesionPropia[], ahora: Date): Date | null {
  const instante = ahora.getTime();
  let menor: number | null = null;
  for (const s of sesiones) {
    for (const t of [Date.parse(s.inicio), Date.parse(s.fin)]) {
      if (t > instante && (menor === null || t < menor)) {
        menor = t;
      }
    }
  }
  return menor === null ? null : new Date(menor);
}

/** La cookie de franjas descartadas: solo UUID válidos, los 20 últimos. */
export function parsearDescartadas(valor: string | undefined): string[] {
  if (!valor) {
    return [];
  }
  const validos = valor.split(',').filter((v) => UUID.test(v));
  return validos.slice(-MAX_DESCARTADAS);
}

/** Añade una cita sin duplicar; si pasa de 20, sale la más antigua. */
export function anadirDescartada(lista: string[], citaId: string): string[] {
  if (lista.includes(citaId)) {
    return lista;
  }
  return [...lista, citaId].slice(-MAX_DESCARTADAS);
}

/** Lo que destaca la cabecera: nivel 2 más nivel 3 (decisión P2). */
export function cuantasDestacadas(recuento: RecuentoNotas): number {
  return recuento.nivel2 + recuento.nivel3;
}

/** Una notificación tal como la pinta la campana. Nada clínico (ADR-038). */
export type NotificacionVista = {
  id: string;
  tipo: string;
  titulo: string | null;
  detalle: string;
  /** Fecha corta ya formateada en el servidor, en la zona de la organización (ADR-034). */
  fecha: string;
  leida: boolean;
};

/**
 * Todo lo que alimenta los avisos del armazón en un instante: la carga del layout y la
 * respuesta de `GET /api/avisos` tienen esta misma forma (T-015, R2).
 */
export type DatosAvisos = {
  /** Instante del servidor al leer, ISO. Una foto más reciente tiene un valor mayor. */
  ahoraServidor: string;
  sesiones: SesionPropia[];
  recuento: RecuentoNotas;
  notificaciones: NotificacionVista[];
  descartadas: string[];
};

const esquemaSesionPropia = z.object({
  citaId: z.string(),
  pacienteId: z.string(),
  nombrePaciente: z.string(),
  inicio: z.iso.datetime(),
  fin: z.iso.datetime(),
  desde: z.string(),
  hasta: z.string(),
  estado: z.enum(ESTADOS_CITA),
});

const esquemaNotificacionVista = z.object({
  id: z.string(),
  tipo: z.string(),
  titulo: z.string().nullable(),
  detalle: z.string(),
  fecha: z.string(),
  leida: z.boolean(),
});

const entero = z.number().int().nonnegative();

/** Valida lo que llega por red: el cliente no se fía de una respuesta que no tenga esta forma. */
export const esquemaDatosAvisos = z.object({
  ahoraServidor: z.iso.datetime(),
  sesiones: z.array(esquemaSesionPropia),
  recuento: z.object({ nivel1: entero, nivel2: entero, nivel3: entero }),
  notificaciones: z.array(esquemaNotificacionVista),
  // El mismo UUID laxo con que la cookie los acepta (`parsearDescartadas`), no el estricto de Zod.
  descartadas: z.array(z.string().regex(UUID)),
});

/**
 * Gana siempre la foto más reciente: la fresca solo sustituye a la inicial si su instante es
 * **estrictamente posterior**. Así ni un refresco lento pisa un layout recién pintado ni al
 * revés. Un instante ilegible no gana.
 */
export function combinarAvisos(inicial: DatosAvisos, fresco: DatosAvisos | null): DatosAvisos {
  if (!fresco) return inicial;
  const nuevo = Date.parse(fresco.ahoraServidor);
  const actual = Date.parse(inicial.ahoraServidor);
  return Number.isFinite(nuevo) && nuevo > actual ? fresco : inicial;
}
