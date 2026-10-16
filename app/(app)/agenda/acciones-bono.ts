'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { t, tCon } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { leerBono, type LecturaBono } from '../facturacion/bonos/estado';
import { hoyEn } from './bloques';

/**
 * El bono de una cita desde la agenda (T-027 §1.8). Dos Server Functions: leer qué se puede mostrar o
 * elegir, y vincular/desvincular. Todo va bajo RLS (el técnico no lee `citas`: para él no hay nada) y
 * cada decisión se repite en servidor al vincular, sin fiarse de lo que ofreció la lectura.
 *
 * Vincular solo cambia `citas.bono_id`; el saldo sigue saliendo de `bonos_consumo` (citas `realizada`).
 * No crea ningún cobro ni toca `bonos`.
 */

export type OpcionBono = { id: string; texto: string };

export type BonoDeCita =
  /** Nada que enseñar: la cita no se ve (técnico), o no hay bono que elegir ni vinculado. */
  | { visible: false }
  /** No se pudo leer: se dice, no se enseña un selector vacío que parezca verdad. */
  | { visible: true; error: string }
  | { visible: true; editable: false; actual: string }
  | {
      visible: true;
      editable: true;
      /** El primer vínculo de una cita ya pasada o realizada no se podrá deshacer (la base lo prohíbe). */
      definitivo: boolean;
      actual: string | null;
      opciones: OpcionBono[];
    };

export type ResultadoVincular = { ok: true; mensaje: string } | { ok: false; mensaje: string };

const esquemaCita = z.uuid();
const esquemaVincular = z.object({ citaId: z.uuid(), bonoId: z.union([z.literal(''), z.uuid()]) });

type Supabase = Awaited<ReturnType<typeof exigirSesion>>['supabase'];

type FilaCita = {
  id: string;
  paciente_id: string;
  centro_id: string | null;
  estado: string;
  inicio: string;
  fin: string;
  bono_id: string | null;
};

type BonoDeLaCita = {
  id: string;
  sesionesTotales: number;
  /** Realizadas más las `programada`/`confirmada` visibles con este bono, sin contar esta cita. */
  comprometidas: number;
  /** El estado en la fecha local de la cita. */
  lectura: LecturaBono;
  sesionesConsumidas: number;
};

const ESTADOS_COMPROMETIDOS = ['programada', 'confirmada'] as const;
const COLUMNAS_CITA = 'id, paciente_id, centro_id, estado, inicio, fin, bono_id';

/**
 * Una cita cancelada no admite bono. Una con bono que ya se realizó o ya pasó, tampoco: la base lo
 * rechaza (42501) y aquí ni se ofrece. Sin bono, una cita pasada todavía puede vincularse.
 */
function esEditable(cita: FilaCita, ahora: Date): boolean {
  if (cita.estado === 'cancelada') return false;
  if (cita.bono_id !== null && (cita.estado === 'realizada' || new Date(cita.fin).getTime() <= ahora.getTime())) {
    return false;
  }
  return true;
}

async function leerCita(supabase: Supabase, citaId: string): Promise<{ ok: true; cita: FilaCita | null } | { ok: false }> {
  const { data, error } = await supabase.from('citas').select(COLUMNAS_CITA).eq('id', citaId).maybeSingle();
  if (error) {
    console.error('bono de la cita: fallo al leer la cita', error.code);
    return { ok: false };
  }
  return { ok: true, cita: data };
}

/**
 * Los bonos del paciente de la cita, cada uno con su estado EN LA FECHA LOCAL DE LA CITA (zona del
 * centro) y con las citas ya comprometidas contra él. Un error en cualquier lectura es `null`.
 */
async function bonosDeLaCita(supabase: Supabase, cita: FilaCita): Promise<BonoDeLaCita[] | null> {
  const { data: zona, error: errorZona } = await supabase.rpc('zona_horaria_centro', {
    // La función acepta null (zona de la organización) y el generador no lo modela (como en `registrarBono`).
    p_centro_id: cita.centro_id as string,
  });
  if (errorZona || typeof zona !== 'string' || zona.length === 0) {
    console.error('bono de la cita: fallo al leer la zona', errorZona?.code);
    return null;
  }
  const fechaDeLaCita = hoyEn(new Date(cita.inicio), zona);

  const { data: filas, error } = await supabase
    .from('bonos_consumo')
    .select('bono_id, sesiones_totales, sesiones_consumidas, caducidad')
    .eq('paciente_id', cita.paciente_id);
  if (error || !filas) {
    console.error('bono de la cita: fallo al leer bonos_consumo', error?.code);
    return null;
  }
  const bonos = filas.flatMap((f) =>
    f.bono_id !== null && typeof f.sesiones_totales === 'number' && typeof f.sesiones_consumidas === 'number'
      ? [{ id: f.bono_id, totales: f.sesiones_totales, consumidas: f.sesiones_consumidas, caducidad: f.caducidad }]
      : [],
  );
  if (bonos.length === 0) return [];

  // Las citas que ya cuentan contra cada bono sin haberse realizado todavía. Solo las visibles por RLS.
  const { data: otras, error: errorOtras } = await supabase
    .from('citas')
    .select('id, bono_id')
    .in(
      'bono_id',
      bonos.map((b) => b.id),
    )
    .in('estado', [...ESTADOS_COMPROMETIDOS])
    .neq('id', cita.id);
  if (errorOtras || !otras) {
    console.error('bono de la cita: fallo al leer las citas comprometidas', errorOtras?.code);
    return null;
  }
  const porBono = new Map<string, number>();
  for (const o of otras) if (o.bono_id !== null) porBono.set(o.bono_id, (porBono.get(o.bono_id) ?? 0) + 1);

  return bonos.map((b) => ({
    id: b.id,
    sesionesTotales: b.totales,
    sesionesConsumidas: b.consumidas,
    comprometidas: b.consumidas + (porBono.get(b.id) ?? 0),
    lectura: leerBono({ sesionesTotales: b.totales, sesionesConsumidas: b.consumidas, caducidad: b.caducidad }, fechaDeLaCita),
  }));
}

/** ¿Se puede vincular la cita a este bono? El que ya tiene siempre; otro, solo vigente y con hueco. */
function sePuedeElegir(bono: BonoDeLaCita, cita: FilaCita): boolean {
  if (bono.id === cita.bono_id) return true;
  return bono.lectura.estado === 'vigente' && bono.comprometidas < bono.sesionesTotales;
}

/**
 * El texto de la opción. «Quedan» descuenta las citas ya vinculadas sin realizar (`comprometidas`), que
 * son las que usa `sePuedeElegir`; en el bono de esta cita se descuenta también ella si aún no se realizó.
 */
function textoDe(bono: BonoDeLaCita, actual: boolean, cita: FilaCita): string {
  const propia = actual && cita.estado !== 'realizada' ? 1 : 0;
  return tCon(actual ? 'bonos.cita.opcionActual' : 'bonos.cita.opcion', {
    totales: bono.sesionesTotales,
    saldo: Math.max(0, bono.sesionesTotales - bono.comprometidas - propia),
  });
}

/** Qué enseñar del bono de una cita. Solo lee. */
export async function leerBonoDeCita(citaId: string): Promise<BonoDeCita> {
  const { supabase } = await exigirSesion();
  if (!esquemaCita.safeParse(citaId).success) return { visible: false };

  const lectura = await leerCita(supabase, citaId);
  if (!lectura.ok) return { visible: true, error: t('bonos.cita.errorLectura') };
  const cita = lectura.cita;
  // Sin fila: el técnico (que no lee `citas`) o una cita que no es suya. No se distingue.
  if (!cita) return { visible: false };

  const bonos = await bonosDeLaCita(supabase, cita);
  if (bonos === null) return { visible: true, error: t('bonos.cita.errorLectura') };

  const editable = esEditable(cita, new Date());
  const vinculado = bonos.find((b) => b.id === cita.bono_id) ?? null;

  if (!editable) {
    if (vinculado === null) return { visible: false };
    return { visible: true, editable: false, actual: textoDe(vinculado, false, cita) };
  }

  const opciones = bonos
    .filter((b) => sePuedeElegir(b, cita))
    .map((b) => ({ id: b.id, texto: textoDe(b, b.id === cita.bono_id, cita) }));
  if (opciones.length === 0 && vinculado === null) return { visible: false };

  return {
    visible: true,
    editable: true,
    definitivo: cita.bono_id === null && (cita.estado === 'realizada' || new Date(cita.fin).getTime() <= Date.now()),
    actual: vinculado === null ? null : vinculado.id,
    opciones,
  };
}

const fallo = (): ResultadoVincular => ({ ok: false, mensaje: t('bonos.cita.noSePudoVincular') });

/**
 * Vincula la cita a un bono, o la desvincula (`bonoId: ''`). `entrada` es `unknown`: punto de entrada
 * público, validado con Zod. Relee la cita y repite las comprobaciones de la lectura; un fallo cualquiera
 * (cita ajena, bono de otro paciente, 42501, 23514, 0 filas) es el mismo mensaje, sin oráculo.
 */
export async function vincularBono(entrada: unknown): Promise<ResultadoVincular> {
  const { supabase } = await exigirSesion();
  const leida = esquemaVincular.safeParse(entrada);
  if (!leida.success) return fallo();
  const { citaId, bonoId } = leida.data;

  const lectura = await leerCita(supabase, citaId);
  if (!lectura.ok || !lectura.cita) return fallo();
  const cita = lectura.cita;
  if (!esEditable(cita, new Date())) return fallo();

  if (bonoId !== '' && bonoId !== cita.bono_id) {
    const bonos = await bonosDeLaCita(supabase, cita);
    const elegido = bonos?.find((b) => b.id === bonoId);
    if (!elegido || !sePuedeElegir(elegido, cita)) return fallo();
  }

  const { data, error } = await supabase
    .from('citas')
    .update({ bono_id: bonoId === '' ? null : bonoId })
    .eq('id', citaId)
    .select('id');
  if (error) {
    // Solo el código: ni paciente ni bono en el registro.
    console.error('vincularBono: la base rechazó el cambio', error.code);
    return fallo();
  }
  // `UPDATE 0` no es éxito: la RLS puede haber ocultado la fila.
  if (!data || data.length === 0) return fallo();

  revalidatePath('/agenda');
  revalidatePath(`/pacientes/${cita.paciente_id}`);
  revalidatePath('/facturacion/bonos');
  return { ok: true, mensaje: bonoId === '' ? t('bonos.cita.desvinculado') : t('bonos.cita.vinculado') };
}
