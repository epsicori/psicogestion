'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { abrirHistoria } from '@/app/(app)/candado/acciones';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { esquemaPin, type DatosPin } from '@/lib/cuentas/esquemas';
import { t } from '@/lib/i18n';

type Props = {
  /** Se llama cuando la ventana queda abierta. La ficha vuelve a pedir la pestaña. */
  alAbrirse: () => void;
};

/**
 * El PIN dentro de la pantalla de bloqueo de la ficha. Llama a la **misma acción** que
 * `/candado` —`abrirHistoria()`— y por tanto hereda su política de mensajes: un PIN
 * incorrecto y un candado bloqueado dicen cosas distintas pero ninguna cuenta intentos, y
 * la acción no separa «ya estabas bloqueado» de «acabas de bloquearte».
 *
 * No verifica nada en cliente: el PIN viaja a la acción y lo comprueba la base. Y **no hay
 * gesto de reponer el PIN**: perderlo no es un trámite de interfaz.
 */
export function FormularioPinHistoria({ alAbrirse }: Props) {
  const [mensaje, setMensaje] = useState('');
  const [trabajando, iniciarTransicion] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DatosPin>({ resolver: zodResolver(esquemaPin), defaultValues: { pin: '' } });

  const enviar = handleSubmit((datos) => {
    setMensaje('');
    iniciarTransicion(async () => {
      const resultado = await abrirHistoria(datos);
      reset({ pin: '' });

      if (resultado.abierta) {
        alAbrirse();
        return;
      }
      setMensaje(resultado.mensaje);
    });
  });

  return (
    <form noValidate onSubmit={enviar} className="mx-auto flex w-full max-w-xs flex-col gap-3">
      <Field
        id="pin-historia"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        etiqueta={t('candado.etiquetaPin')}
        errores={errors.pin?.message ? [errors.pin.message] : undefined}
        {...register('pin')}
      />

      <Button type="submit" disabled={trabajando}>
        {trabajando ? t('comunes.cargando') : t('candado.abrir')}
      </Button>

      {mensaje && (
        <p role="status" className="text-destructive text-sm">
          {mensaje}
        </p>
      )}
    </form>
  );
}
