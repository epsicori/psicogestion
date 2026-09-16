'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { AreaTexto } from '@/components/ui/area-texto';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Seleccion } from '@/components/ui/seleccion';
import { t } from '@/lib/i18n';
import { ESTADO_INICIAL, aplicarErroresDelServidor } from '@/lib/formularios';

import { crearPaciente } from './acciones';
import { esquemaNuevoPaciente, type DatosNuevoPaciente, type EntradaNuevoPaciente } from './esquemas';

// Los campos de «Más datos» son justo los que quedan fuera de la fila obligatoria: si alguno
// trae un error tras el envío, el <details> se abre solo, porque un error invisible es un
// formulario que no se envía y nadie sabe por qué.
const CAMPOS_MAS_DATOS = [
  'telefono',
  'sexo',
  'dni',
  'domicilio',
  'alergias',
  'medicacionActual',
] as const;

const OPCIONES_SEXO = [
  { valor: 'hombre', texto: t('pacientes.sexoHombre') },
  { valor: 'mujer', texto: t('pacientes.sexoMujer') },
  { valor: 'otro', texto: t('pacientes.sexoOtro') },
];

export function FormularioNuevoPaciente() {
  const [enviando, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState('');
  const [masDatosAbierto, setMasDatosAbierto] = useState(false);
  const detallesRef = useRef<HTMLDetailsElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<EntradaNuevoPaciente, unknown, DatosNuevoPaciente>({
    resolver: zodResolver(esquemaNuevoPaciente),
    defaultValues: { nombre: '', apellidos: '', fechaNacimiento: '' },
  });

  // Abre «Más datos» solo cuando algún campo de dentro trae un error, del cliente o del
  // servidor: el `<details>` es HTML nativo y su `open` no participa en el estado de RHF.
  // Se calcula en el render, no en un efecto: leer `errors[campo]` aquí suscribe a esa
  // clave del Proxy perezoso de react-hook-form, así que se refleja tanto el error que
  // pone `handleSubmit` en el momento (validación de cliente) como el que mete `setError()`
  // dentro del `startTransition` de la respuesta del servidor.
  const hayErrorEnMasDatos = CAMPOS_MAS_DATOS.some((campo) => errors[campo]);

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
      setMasDatosAbierto(false);
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

        <div className="flex-1">
          <Field
            id="fechaNacimiento"
            type="date"
            required
            etiqueta={t('pacientes.fechaDeNacimiento')}
            className="w-full"
            errores={
              errors.fechaNacimiento?.message ? [errors.fechaNacimiento.message] : undefined
            }
            {...register('fechaNacimiento')}
          />
        </div>
      </div>

      <details
        ref={detallesRef}
        open={masDatosAbierto || hayErrorEnMasDatos}
        onToggle={(evento) => setMasDatosAbierto(evento.currentTarget.open)}
        className="mt-4"
      >
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium">
          {t('pacientes.masDatos')}
        </summary>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Field
                id="telefono"
                type="tel"
                etiqueta={t('pacientes.telefono')}
                className="w-full"
                errores={errors.telefono?.message ? [errors.telefono.message] : undefined}
                {...register('telefono')}
              />
            </div>
            <div className="flex-1">
              <Seleccion
                id="sexo"
                etiqueta={t('pacientes.sexo')}
                opciones={OPCIONES_SEXO}
                className="w-full"
                errores={errors.sexo?.message ? [errors.sexo.message] : undefined}
                {...register('sexo')}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Field
                id="dni"
                type="text"
                etiqueta={t('pacientes.dniONie')}
                className="w-full"
                errores={errors.dni?.message ? [errors.dni.message] : undefined}
                {...register('dni')}
              />
            </div>
            <div className="flex-1">
              <Field
                id="domicilio"
                type="text"
                etiqueta={t('pacientes.domicilio')}
                className="w-full"
                errores={errors.domicilio?.message ? [errors.domicilio.message] : undefined}
                {...register('domicilio')}
              />
            </div>
          </div>

          <AreaTexto
            id="alergias"
            etiqueta={t('pacientes.alergias')}
            errores={errors.alergias?.message ? [errors.alergias.message] : undefined}
            {...register('alergias')}
          />

          <AreaTexto
            id="medicacionActual"
            etiqueta={t('pacientes.medicacionActual')}
            errores={
              errors.medicacionActual?.message ? [errors.medicacionActual.message] : undefined
            }
            {...register('medicacionActual')}
          />
        </div>
      </details>

      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={enviando}>
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
