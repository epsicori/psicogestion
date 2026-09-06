'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { t } from '@/lib/i18n';
import { ESTADO_INICIAL, type EstadoFormulario } from '@/lib/formularios';
import { exigirSesion } from '@/lib/supabase/sesion';

import { esquemaNuevoPaciente } from './esquemas';

/**
 * `datos` es `unknown` a propósito: una Server Action es un punto de entrada
 * público y el formulario de cliente no es la única forma de llamarla. El esquema
 * que valida aquí es EL MISMO que usa el formulario con `zodResolver`.
 */
export async function crearPaciente(datos: unknown): Promise<EstadoFormulario> {
  // 1. La autorización se comprueba dentro de la acción, no se hereda del Proxy.
  const { supabase, usuario } = await exigirSesion();

  // 2. Validación.
  const resultado = esquemaNuevoPaciente.safeParse(datos);

  if (!resultado.success) {
    return {
      ...ESTADO_INICIAL,
      errores: z.flattenError(resultado.error).fieldErrors,
    };
  }

  // 3. profesional_id sale de la sesión, jamás del formulario, aunque RLS lo
  // rechazaría igual.
  const { error } = await supabase.from('pacientes').insert({
    nombre: resultado.data.nombre,
    apellidos: resultado.data.apellidos,
    profesional_id: usuario.id,
  });

  if (error) {
    // 4. Mensaje genérico siempre, nunca el texto de Postgres (p. ej. 42501 de RLS).
    // El detalle se registra en servidor, para distinguir un 42501 (RLS, esperado)
    // de una base de datos caída u otro fallo real.
    console.error('crearPaciente: fallo al insertar en pacientes', error);
    return { ...ESTADO_INICIAL, mensaje: t('pacientes.noSePudoCrearElPaciente') };
  }

  // 5. Sin redirect: la lista se actualiza en el mismo viaje.
  revalidatePath('/pacientes');
  return ESTADO_INICIAL;
}
