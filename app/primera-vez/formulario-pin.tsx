'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { esquemaPin } from '@/lib/cuentas/esquemas';
import { ESTADO_INICIAL, aplicarErroresDelServidor } from '@/lib/formularios';
import { t } from '@/lib/i18n';

import { fijarPin } from './acciones';

/**
 * `esquemaPin` —seis dígitos exactos— es EL MISMO objeto que valida la Server
 * Action. Lo único que añade esta pantalla es la **confirmación**: teclearlo dos
 * veces es una precaución de interfaz, porque un PIN mal tecleado no se puede
 * recuperar —reponer el PIN de otro no existe (ADR-026)— y el usuario se quedaría
 * fuera de su propia historia hasta que un administrador lo diera de baja.
 */
const esquemaConConfirmacion = esquemaPin
  .extend({ confirmacion: z.string() })
  .refine((datos) => datos.pin === datos.confirmacion, {
    message: t('primeraVez.pin.noCoinciden'),
    path: ['confirmacion'],
  });

type DatosPinConfirmado = z.infer<typeof esquemaConConfirmacion>;

export function FormularioPin() {
  const router = useRouter();
  const [enviando, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState('');

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DatosPinConfirmado>({
    resolver: zodResolver(esquemaConConfirmacion),
    defaultValues: { pin: '', confirmacion: '' },
  });

  const enviar = handleSubmit((datos) => {
    setMensaje('');
    iniciarTransicion(async () => {
      // A la acción le va el PIN y nada más: la confirmación no sale de aquí.
      const estado = (await fijarPin({ pin: datos.pin })) ?? ESTADO_INICIAL;
      aplicarErroresDelServidor(estado, setError);

      if (!estado.errores) {
        // El paso deja de estar pendiente, así que la guardia ya deja pasar: se
        // refresca para que el servidor vuelva a decidir a dónde va este usuario.
        router.refresh();
        return;
      }

      setMensaje(estado.mensaje ?? '');
    });
  });

  return (
    <form noValidate onSubmit={enviar} className="flex flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold tracking-tight">{t('primeraVez.pin.titulo')}</h2>
      <p className="text-muted-foreground text-sm">{t('primeraVez.pin.explicacion')}</p>

      <Field
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        etiqueta={t('primeraVez.pin.etiqueta')}
        errores={errors.pin?.message ? [errors.pin.message] : undefined}
        {...register('pin')}
      />

      <Field
        id="confirmacion"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        etiqueta={t('primeraVez.pin.confirmacion')}
        errores={errors.confirmacion?.message ? [errors.confirmacion.message] : undefined}
        {...register('confirmacion')}
      />

      <Button type="submit" disabled={enviando}>
        {enviando ? t('comunes.cargando') : t('primeraVez.pin.fijar')}
      </Button>

      {mensaje && (
        <p role="status" className="text-sm">
          {mensaje}
        </p>
      )}
    </form>
  );
}
