'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { t } from '@/lib/i18n';
import { ESTADO_INICIAL, type EstadoFormulario } from '@/lib/formularios';
import { crearClienteServidor } from '@/lib/supabase/servidor';

import { esquemaInicioSesion } from './esquemas';

/**
 * El parámetro es `unknown` A PROPÓSITO, aunque el formulario mande un objeto ya
 * validado por el mismo esquema en cliente: una Server Action es un punto de
 * entrada público y lo que llega por ahí no está validado por definición. La
 * validación de cliente es comodidad; ESTA es la que manda.
 */
export async function iniciarSesion(datos: unknown): Promise<EstadoFormulario> {
  const resultado = esquemaInicioSesion.safeParse(datos);

  if (!resultado.success) {
    return {
      ...ESTADO_INICIAL,
      errores: z.flattenError(resultado.error).fieldErrors,
    };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: resultado.data.correo,
    password: resultado.data.contrasena,
  });

  if (error) {
    // Mensaje genérico: no revelar si el correo existe.
    return { ...ESTADO_INICIAL, mensaje: t('acceso.credencialesNoValidas') };
  }

  redirect('/pacientes');
}
