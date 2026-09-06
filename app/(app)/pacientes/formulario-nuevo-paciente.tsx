'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { t } from '@/lib/i18n';
import { ESTADO_INICIAL, aplicarErroresDelServidor } from '@/lib/formularios';

import { crearPaciente } from './acciones';
import { esquemaNuevoPaciente, type DatosNuevoPaciente } from './esquemas';

export function FormularioNuevoPaciente() {
  const [enviando, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState('');

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<DatosNuevoPaciente>({
    resolver: zodResolver(esquemaNuevoPaciente),
    defaultValues: { nombre: '', apellidos: '' },
  });

  const enviar = handleSubmit((datos) => {
    setMensaje('');
    iniciarTransicion(async () => {
      const estado = (await crearPaciente(datos)) ?? ESTADO_INICIAL;

      if (estado.errores || estado.mensaje) {
        aplicarErroresDelServidor(estado, setError);
        setMensaje(estado.mensaje ?? '');
        return;
      }

      // El alta salió bien: se vacía el formulario para el siguiente. La lista se
      // refresca sola con el `revalidatePath` de la acción.
      reset();
    });
  });

  return (
    <form onSubmit={enviar} noValidate className="border-border bg-card rounded-xl border p-5 shadow-sm">
      <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-[0.16em] uppercase">
        {t('pacientes.nuevoPaciente')}
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Field
            id="nombre"
            type="text"
            required
            etiqueta={t('pacientes.nombre')}
            className="w-full"
            errores={errors.nombre?.message ? [errors.nombre.message] : undefined}
            {...register('nombre')}
          />
        </div>

        <div className="flex-1">
          <Field
            id="apellidos"
            type="text"
            required
            etiqueta={t('pacientes.apellidos')}
            className="w-full"
            errores={errors.apellidos?.message ? [errors.apellidos.message] : undefined}
            {...register('apellidos')}
          />
        </div>

        <Button type="submit" disabled={enviando} className="sm:mt-7">
          <Plus />
          {enviando ? t('pacientes.creando') : t('pacientes.crearPaciente')}
        </Button>
      </div>

      <p aria-live="polite" className="text-destructive mt-3 text-sm empty:mt-0">
        {mensaje}
      </p>
    </form>
  );
}
