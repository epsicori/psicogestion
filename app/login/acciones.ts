'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { t } from '@/lib/i18n';
import { ESTADO_INICIAL, type EstadoFormulario } from '@/lib/formularios';
import { crearClienteServidor } from '@/lib/supabase/servidor';

import { esquemaInicioSesion } from './esquemas';

export async function iniciarSesion(
  _estadoPrevio: EstadoFormulario,
  datosFormulario: FormData,
): Promise<EstadoFormulario> {
  const resultado = esquemaInicioSesion.safeParse({
    correo: datosFormulario.get('correo'),
    contrasena: datosFormulario.get('contrasena'),
  });

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
