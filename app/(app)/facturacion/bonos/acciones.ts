'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { aCentimos } from '@/lib/dinero/importe';
import { ESTADO_INICIAL, type EstadoFormulario } from '@/lib/formularios';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { hoyEn } from '../../agenda/bloques';
import { importeParaBd } from '../esquemas';
import { crearEsquemaBono } from './esquemas';

/** La clave de envío: la genera el formulario y es la clave primaria del bono. */
const esquemaClave = z.object({ id: z.uuid() });
const esquemaPaciente = z.object({ pacienteId: z.uuid({ error: t('bonos.eligePaciente') }) });

/** Mensaje genérico: el mismo para «no existe», «no es tuyo» y «la base dijo que no». Sin oráculo. */
const fallo = (): EstadoFormulario => ({ ...ESTADO_INICIAL, mensaje: t('bonos.noSePudoRegistrar') });

/** ¿Existe ya un bono con esta clave, creado por esta sesión y visible por RLS? Con `creado_por` un id ajeno no se ve. */
async function leerBonoPropio(
  supabase: Awaited<ReturnType<typeof exigirSesion>>['supabase'],
  id: string,
  usuarioId: string,
) {
  return supabase.from('bonos').select('id').eq('id', id).eq('creado_por', usuarioId).maybeSingle();
}

/**
 * Registra un bono de sesiones (T-027 §1.3). Calco de `registrarCobro`: `datos` es `unknown`, se valida
 * con el MISMO esquema del formulario y con el «hoy» del centro del paciente, calculado aquí.
 *
 * **No crea un cobro, no toca `cobros` ni `bonos_caducidades`**: el bono se paga con un cobro aparte
 * (T-023). Un bono no es una factura (ADR-053).
 */
export async function registrarBono(datos: unknown): Promise<EstadoFormulario> {
  // 1. La autorización, dentro de la acción.
  const { supabase, usuario } = await exigirSesion();

  // 1b. La clave de envío: sin ella un reintento tras un corte de red podría duplicar el bono.
  const clave = esquemaClave.safeParse(datos);
  if (!clave.success) return fallo();
  const { id } = clave.data;

  // 2. El paciente primero: de él sale la zona con la que se valida la caducidad.
  const paciente = esquemaPaciente.safeParse(datos);
  if (!paciente.success) {
    return { ...ESTADO_INICIAL, errores: z.flattenError(paciente.error).fieldErrors };
  }
  const { pacienteId } = paciente.data;

  // 2b. La clave propia, antes de las guardas: si el primer envío ya entró, un reintento no debe caer
  // en una guarda transitoria. La autoridad sigue siendo la clave primaria.
  const { data: previo, error: errorPrevio } = await leerBonoPropio(supabase, id, usuario.id);
  if (errorPrevio) console.error('registrarBono: fallo al buscar la clave de envío', errorPrevio.code);
  if (previo && !errorPrevio) {
    revalidatePath('/facturacion/bonos');
    revalidatePath(`/pacientes/${pacienteId}`);
    return { ...ESTADO_INICIAL, mensaje: t('bonos.bonoYaRegistrado') };
  }

  // 3. Bajo RLS: un paciente que no se ve es el mismo mensaje que un 42501.
  const { data: fila, error: errorPaciente } = await supabase
    .from('pacientes')
    .select('centro_id, fusionado_en')
    .eq('id', pacienteId)
    .maybeSingle();
  if (errorPaciente || !fila) {
    if (errorPaciente) console.error('registrarBono: fallo al leer el paciente', errorPaciente.code);
    return fallo();
  }
  // Un paciente fusionado ya no recibe bonos nuevos: sus citas viven en el superviviente (ADR-031).
  if (fila.fusionado_en !== null) {
    return { ...ESTADO_INICIAL, errores: { pacienteId: [t('bonos.pacienteFusionado')] } };
  }

  // 4. «Hoy» en la zona del centro del paciente (o la de la organización si no tiene centro).
  const { data: zona, error: errorZona } = await supabase.rpc('zona_horaria_centro', {
    // El generador no modela el null que la función acepta (como en `registrarCobro`).
    p_centro_id: fila.centro_id as string,
  });
  if (errorZona || typeof zona !== 'string' || zona.length === 0) {
    console.error('registrarBono: fallo al leer la zona del centro', errorZona?.code);
    return fallo();
  }
  const hoy = hoyEn(new Date(), zona);

  // 5. El esquema entero.
  const resultado = crearEsquemaBono(hoy).safeParse(datos);
  if (!resultado.success) {
    return { ...ESTADO_INICIAL, errores: z.flattenError(resultado.error).fieldErrors };
  }
  const { sesionesTotales, importe, caducidad } = resultado.data;

  // 6. `id` es la clave de envío; `creado_en` lo pone la base y `creado_por` sale de la sesión.
  const { error } = await supabase.from('bonos').insert({
    id,
    paciente_id: pacienteId,
    sesiones_totales: Number(sesionesTotales),
    // El generador tipa `numeric` como `number`, pero PostgREST acepta el texto y así el importe
    // no pasa nunca por coma flotante. El cast es solo para el tipo.
    importe: importeParaBd(aCentimos(importe)) as unknown as number,
    caducidad: caducidad ?? null,
    creado_por: usuario.id,
  });

  if (error) {
    // Reintento de un envío que ya entró: solo se da por bueno si el bono existe, es de esta sesión y
    // la RLS lo deja ver; con otra cosa no hay oráculo.
    if (error.code === '23505' && error.message?.includes('bonos_pkey')) {
      const { data: propio, error: errorRelectura } = await leerBonoPropio(supabase, id, usuario.id);
      if (errorRelectura) {
        console.error('registrarBono: falló la relectura tras 23505', errorRelectura.code);
        return { ...ESTADO_INICIAL, mensaje: t('bonos.resultadoDesconocido') };
      }
      if (propio) {
        revalidatePath('/facturacion/bonos');
        revalidatePath(`/pacientes/${pacienteId}`);
        return { ...ESTADO_INICIAL, mensaje: t('bonos.bonoYaRegistrado') };
      }
    }
    // Solo el código: ni importe ni paciente en el registro.
    console.error('registrarBono: la base rechazó el bono', error.code);
    return fallo();
  }

  // 7. Las pantallas se refrescan en el mismo viaje.
  revalidatePath('/facturacion/bonos');
  revalidatePath(`/pacientes/${pacienteId}`);
  return { ...ESTADO_INICIAL, mensaje: t('bonos.bonoRegistrado') };
}
