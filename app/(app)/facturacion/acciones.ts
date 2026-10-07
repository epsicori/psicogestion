'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { aCentimos } from '@/lib/dinero/importe';
import { t } from '@/lib/i18n';
import { ESTADO_INICIAL, type EstadoFormulario } from '@/lib/formularios';
import { exigirSesion } from '@/lib/supabase/sesion';

import { hoyEn } from '../agenda/bloques';
import { crearEsquemaCobro, importeParaBd } from './esquemas';

const esquemaPaciente = z.object({ pacienteId: z.uuid({ error: t('cobros.eligePaciente') }) });

/** Mensaje genérico: el mismo para «no existe», «no es tuyo» y «la base dijo que no». Sin oráculo. */
const fallo = (): EstadoFormulario => ({ ...ESTADO_INICIAL, mensaje: t('cobros.noSePudoRegistrar') });

/**
 * Registra un cobro, o una devolución si el importe es negativo (T-023 §1.6).
 *
 * `datos` es `unknown`: una Server Action es un punto de entrada público. Se valida con el MISMO
 * esquema del formulario, pero con el «hoy» del centro del paciente, calculado aquí: el que mande
 * el cliente no se mira. La base lo vuelve a comprobar con `validar_cobro` (D10).
 */
export async function registrarCobro(datos: unknown): Promise<EstadoFormulario> {
  // 1. La autorización, dentro de la acción.
  const { supabase, usuario } = await exigirSesion();

  // 2. El paciente primero: de él sale la zona con la que se valida la fecha.
  const paciente = esquemaPaciente.safeParse(datos);
  if (!paciente.success) {
    return { ...ESTADO_INICIAL, errores: z.flattenError(paciente.error).fieldErrors };
  }
  const { pacienteId } = paciente.data;

  // 3. Bajo RLS: un paciente que no se ve es el mismo mensaje que un 42501.
  const { data: fila, error: errorPaciente } = await supabase
    .from('pacientes')
    .select('centro_id, fusionado_en')
    .eq('id', pacienteId)
    .maybeSingle();
  if (errorPaciente || !fila) {
    if (errorPaciente) console.error('registrarCobro: fallo al leer el paciente', errorPaciente.code);
    return fallo();
  }
  // Un paciente fusionado ya no recibe cobros: su pendiente vive en el superviviente (ADR-031).
  if (fila.fusionado_en !== null) {
    return { ...ESTADO_INICIAL, errores: { pacienteId: [t('cobros.pacienteFusionado')] } };
  }

  // 4. «Hoy» en la zona del centro del paciente (o la de la organización si no tiene centro).
  const { data: zona, error: errorZona } = await supabase.rpc('zona_horaria_centro', {
    // El generador no modela el null que la función acepta (como en `zonaDeCentro`).
    p_centro_id: fila.centro_id as string,
  });
  if (errorZona || typeof zona !== 'string' || zona.length === 0) {
    console.error('registrarCobro: fallo al leer la zona del centro', errorZona?.code);
    return fallo();
  }
  const hoy = hoyEn(new Date(), zona);

  // 5. El esquema entero.
  const resultado = crearEsquemaCobro(hoy).safeParse(datos);
  if (!resultado.success) {
    return { ...ESTADO_INICIAL, errores: z.flattenError(resultado.error).fieldErrors };
  }
  const { importe, fecha, formaPago, referencia, motivo } = resultado.data;

  // 6. Sin `id` ni `registrado_en` (los pone la base) y `registrado_por` de la sesión.
  const centimos = aCentimos(importe);
  const { error } = await supabase.from('cobros').insert({
    paciente_id: pacienteId,
    // El generador tipa `numeric` como `number`, pero PostgREST acepta el texto y así el importe
    // no pasa nunca por coma flotante (diseño §1.5, D8). El cast es solo para el tipo.
    importe: importeParaBd(centimos) as unknown as number,
    fecha,
    forma_pago: formaPago,
    referencia: referencia ?? null,
    motivo: centimos < 0 ? (motivo ?? null) : null,
    registrado_por: usuario.id,
  });

  // 7. Los dos 23514 que tienen campo vuelven junto a su campo; el resto, mensaje genérico.
  if (error) {
    if (error.code === '23514' && error.message?.includes('no puede ser posterior a hoy')) {
      return { ...ESTADO_INICIAL, errores: { fecha: [t('cobros.fechaFutura')] } };
    }
    if (error.code === '23514' && error.message?.includes('cobros_devolucion_motivo_ck')) {
      return { ...ESTADO_INICIAL, errores: { motivo: [t('cobros.devolucionNecesitaMotivo')] } };
    }
    // Solo el código: ni importe ni paciente en el registro.
    console.error('registrarCobro: la base rechazó el cobro', error.code);
    return fallo();
  }

  // 8. La pantalla se refresca en el mismo viaje.
  revalidatePath('/facturacion');
  return { ...ESTADO_INICIAL, mensaje: t('cobros.cobroRegistrado') };
}
