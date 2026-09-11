'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Desplegable, type OpcionDesplegable } from '@/components/ui/desplegable';
import { Field } from '@/components/ui/field';
import { ESTADO_INICIAL, aplicarErroresDelServidor } from '@/lib/formularios';
import { esquemaInvitacion, type DatosInvitacion } from '@/lib/cuentas/esquemas';
import { t } from '@/lib/i18n';

import { invitar } from '../acciones';

type Props = {
  centros: OpcionDesplegable[];
};

const ROLES: OpcionDesplegable[] = [
  { valor: 'profesional_sanitario', etiqueta: t('roles.profesionalSanitario') },
  { valor: 'tecnico_administrativo', etiqueta: t('roles.tecnicoAdministrativo') },
  { valor: 'administrador', etiqueta: t('roles.administrador') },
];

/**
 * `esquemaInvitacion` es EL MISMO objeto Zod que valida dentro de la Server Action
 * —incluido su `.refine`, el que exige centro al técnico administrativo—. No hay
 * una segunda copia de esa regla en esta pantalla.
 */
export function FormularioInvitar({ centros }: Props) {
  const [enviando, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState('');

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<DatosInvitacion>({
    resolver: zodResolver(esquemaInvitacion),
    defaultValues: { correo: '', nombreCompleto: '', rol: 'profesional_sanitario', centroId: null },
  });

  // useWatch y no watch(): watch() no se puede memoizar y el compilador de React lo
  // avisa (react-hooks/incompatible-library).
  const rol = useWatch({ control, name: 'rol' });
  const centroId = useWatch({ control, name: 'centroId' });
  const exigeCentro = rol === 'tecnico_administrativo';

  const enviar = handleSubmit((datos) => {
    setMensaje('');
    iniciarTransicion(async () => {
      const estado = (await invitar(datos)) ?? ESTADO_INICIAL;
      aplicarErroresDelServidor(estado, setError);
      setMensaje(estado.mensaje ?? '');
    });
  });

  return (
    <form noValidate onSubmit={enviar} className="flex flex-col gap-5">
      <Field
        id="nombreCompleto"
        etiqueta={t('invitar.formulario.nombre')}
        autoComplete="name"
        errores={errors.nombreCompleto?.message ? [errors.nombreCompleto.message] : undefined}
        {...register('nombreCompleto')}
      />

      <Field
        id="correo"
        type="email"
        etiqueta={t('invitar.formulario.correo')}
        autoComplete="email"
        errores={errors.correo?.message ? [errors.correo.message] : undefined}
        {...register('correo')}
      />

      <Desplegable
        etiqueta={t('invitar.formulario.rol')}
        opciones={ROLES}
        valor={rol}
        alElegir={(valor) => {
          setValue('rol', valor as DatosInvitacion['rol'], { shouldValidate: true });
          // Cambiar a un rol que no exige centro limpia el que hubiera: si no, se
          // mandaría un centro para un perfil que no lo lleva.
          if (valor !== 'tecnico_administrativo') {
            setValue('centroId', null, { shouldValidate: true });
          }
        }}
      />

      {exigeCentro && (
        <div className="flex flex-col gap-1.5">
          <Desplegable
            etiqueta={t('invitar.formulario.centro')}
            opciones={centros}
            valor={centroId}
            alElegir={(valor) => setValue('centroId', valor, { shouldValidate: true })}
          />
          <p className="text-muted-foreground text-sm">{t('invitar.formulario.centroAyuda')}</p>
          {errors.centroId?.message && (
            <p className="text-destructive text-sm">{errors.centroId.message}</p>
          )}
        </div>
      )}

      <Button type="submit" disabled={enviando}>
        {enviando ? t('comunes.cargando') : t('invitar.formulario.enviar')}
      </Button>

      {mensaje && (
        <p role="status" className="text-sm">
          {mensaje}
        </p>
      )}
    </form>
  );
}
