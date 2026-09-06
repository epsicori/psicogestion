'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { t } from '@/lib/i18n';
import { ESTADO_INICIAL, aplicarErroresDelServidor } from '@/lib/formularios';

import { iniciarSesion } from './acciones';
import { esquemaInicioSesion, type DatosInicioSesion } from './esquemas';

/**
 * `esquemaInicioSesion` es EL MISMO objeto Zod que valida dentro de la Server
 * Action. No hay una segunda copia de las reglas: si el máximo de la contraseña
 * cambia, cambia en los dos sitios porque es un solo sitio.
 */
export function FormularioLogin() {
  const [enviando, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState('');

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DatosInicioSesion>({
    resolver: zodResolver(esquemaInicioSesion),
    defaultValues: { correo: '', contrasena: '' },
  });

  const enviar = handleSubmit((datos) => {
    setMensaje('');
    iniciarTransicion(async () => {
      const estado = (await iniciarSesion(datos)) ?? ESTADO_INICIAL;
      aplicarErroresDelServidor(estado, setError);
      setMensaje(estado.mensaje ?? '');
    });
  });

  return (
    // `noValidate` para que los mensajes sean los de Zod y no los burbujas del
    // navegador, que ni se pueden traducir ni los lee bien un lector de pantalla.
    // Los `required` se quedan: siguen siendo la semántica correcta del control.
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Field
        id="correo"
        type="email"
        required
        autoComplete="email"
        etiqueta={t('acceso.correo')}
        errores={errors.correo?.message ? [errors.correo.message] : undefined}
        {...register('correo')}
      />

      <Field
        id="contrasena"
        type="password"
        required
        autoComplete="current-password"
        etiqueta={t('acceso.contrasena')}
        errores={errors.contrasena?.message ? [errors.contrasena.message] : undefined}
        {...register('contrasena')}
      />

      <p aria-live="polite" className="text-destructive text-sm empty:hidden">
        {mensaje}
      </p>

      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? t('acceso.entrando') : t('acceso.entrar')}
      </Button>
    </form>
  );
}
