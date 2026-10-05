'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { esquemaCodigoRecuperacion, type DatosCodigoRecuperacion } from '@/lib/cuentas/esquemas';
import { t } from '@/lib/i18n';

import { canjearCodigo } from './acciones';

/**
 * Canje de un código de recuperación. `esquemaCodigoRecuperacion` es EL MISMO
 * objeto que valida la Server Action.
 *
 * Al acertar **no se felicita y se queda**: el factor TOTP acaba de borrarse, así
 * que lo único que falta es enrolar uno nuevo, y ahí es donde se lleva al usuario.
 */
export function FormularioRecuperar() {
  const router = useRouter();
  const [enviando, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DatosCodigoRecuperacion>({
    resolver: zodResolver(esquemaCodigoRecuperacion),
    defaultValues: { codigo: '' },
  });

  const enviar = handleSubmit((datos) => {
    setMensaje('');
    iniciarTransicion(async () => {
      const resultado = await canjearCodigo(datos.codigo);

      if (resultado.ok) {
        router.replace('/primera-vez');
        return;
      }

      reset({ codigo: '' });
      setMensaje(resultado.mensaje);
    });
  });

  return (
    <form noValidate onSubmit={enviar} className="flex flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold tracking-tight">{t('recuperar.titulo')}</h2>
      <p className="text-muted-foreground text-sm">{t('recuperar.explicacion')}</p>

      <Field
        id="codigo"
        autoComplete="one-time-code"
        etiqueta={t('recuperar.etiqueta')}
        errores={errors.codigo?.message ? [errors.codigo.message] : undefined}
        {...register('codigo')}
      />

      <Button type="submit" disabled={enviando}>
        {enviando ? t('comunes.cargando') : t('recuperar.canjear')}
      </Button>

      {mensaje && (
        <p role="status" className="text-destructive text-sm">
          {mensaje}
        </p>
      )}

      <Link
        href="/primera-vez"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex min-h-11 items-center self-center text-center text-sm underline underline-offset-4 outline-none focus-visible:ring-2 rounded"
      >
        {t('recuperar.volver')}
      </Link>
    </form>
  );
}
