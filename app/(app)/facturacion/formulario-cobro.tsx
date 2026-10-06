'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { AreaTexto } from '@/components/ui/area-texto';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Seleccion } from '@/components/ui/seleccion';
import { aCentimos } from '@/lib/dinero/importe';
import { ESTADO_INICIAL, aplicarErroresDelServidor } from '@/lib/formularios';
import { t } from '@/lib/i18n';

import { registrarCobro } from './acciones';
import { FORMAS_DE_PAGO, crearEsquemaCobro, type DatosCobro, type EntradaCobro } from './esquemas';

type Props = {
  pacientes: { id: string; nombre: string; apellidos: string }[];
  /** «Hoy» en la zona de la organización, calculado en servidor (ADR-034). */
  hoy: string;
  /** Se llama cuando la acción confirma el cobro. */
  alRegistrar: () => void;
};

const OPCIONES_FORMA = FORMAS_DE_PAGO.map((forma) => ({ valor: forma, texto: t(`cobros.formas.${forma}`) }));

/** El motivo se pinta solo con un importe que se lee como negativo; lo ilegible no lo es. */
function esNegativo(importe: string | undefined): boolean {
  try {
    return aCentimos((importe ?? '').trim()) < 0;
  } catch {
    return false;
  }
}

/**
 * Registrar un cobro o una devolución (T-023 §1.4), calcado de `formulario-nuevo-paciente.tsx`:
 * el mismo esquema en cliente y en la acción, y a la acción va la SALIDA del esquema. Aquí no se
 * emite ni se aprueba nada (ADR-078): se anota lo que se ha cobrado.
 */
export function FormularioCobro({ pacientes, hoy, alRegistrar }: Props) {
  const [enviando, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState('');
  const esquema = useMemo(() => crearEsquemaCobro(hoy), [hoy]);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<EntradaCobro, unknown, DatosCobro>({
    resolver: zodResolver(esquema),
    defaultValues: { pacienteId: '', importe: '', fecha: hoy, referencia: '', motivo: '' },
  });

  // useWatch y no watch(): watch() no se puede memoizar y el compilador de React lo salta.
  const devolucion = esNegativo(useWatch({ control, name: 'importe' }));

  function alSerValido(datos: DatosCobro) {
    setMensaje('');
    iniciarTransicion(async () => {
      const estado = (await registrarCobro(datos)) ?? ESTADO_INICIAL;
      if (!estado.errores && estado.mensaje === t('cobros.cobroRegistrado')) {
        alRegistrar();
        return;
      }
      aplicarErroresDelServidor(estado, setError);
      setMensaje(estado.errores ? '' : (estado.mensaje ?? t('cobros.noSePudoRegistrar')));
    });
  }

  const errorDe = (mensajeError: string | undefined) => (mensajeError ? [mensajeError] : undefined);

  return (
    <form onSubmit={handleSubmit(alSerValido)} noValidate className="flex flex-col gap-4">
      <Seleccion
        id="pacienteId"
        etiqueta={t('cobros.paciente')}
        textoVacio={t('cobros.eligePaciente')}
        opciones={pacientes.map((p) => ({ valor: p.id, texto: `${p.apellidos}, ${p.nombre}` }))}
        errores={errorDe(errors.pacienteId?.message)}
        {...register('pacienteId')}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-1 flex-col gap-1">
          <Field
            id="importe"
            type="text"
            inputMode="decimal"
            etiqueta={t('cobros.importe')}
            className="w-full"
            errores={errorDe(errors.importe?.message)}
            aria-describedby={errors.importe?.message ? 'importe-error importe-ayuda' : 'importe-ayuda'}
            {...register('importe')}
          />
          <p id="importe-ayuda" className="text-xs text-muted-foreground">
            {t('cobros.ayudaImporte')}
          </p>
        </div>
        <div className="flex-1">
          <Field
            id="fecha"
            type="date"
            max={hoy}
            etiqueta={t('cobros.fecha')}
            className="w-full"
            errores={errorDe(errors.fecha?.message)}
            {...register('fecha')}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Seleccion
            id="formaPago"
            etiqueta={t('cobros.formaPago')}
            textoVacio={t('cobros.formaPagoNoValida')}
            opciones={OPCIONES_FORMA}
            className="w-full"
            errores={errorDe(errors.formaPago?.message)}
            {...register('formaPago')}
          />
        </div>
        <div className="flex-1">
          <Field
            id="referencia"
            type="text"
            etiqueta={t('cobros.referencia')}
            className="w-full"
            errores={errorDe(errors.referencia?.message)}
            {...register('referencia')}
          />
        </div>
      </div>

      {devolucion && (
        <div className="flex flex-col gap-1">
          <AreaTexto
            id="motivo"
            etiqueta={t('cobros.motivo')}
            errores={errorDe(errors.motivo?.message)}
            aria-describedby={errors.motivo?.message ? 'motivo-error motivo-ayuda' : 'motivo-ayuda'}
            {...register('motivo')}
          />
          <p id="motivo-ayuda" className="text-xs text-muted-foreground">
            {t('cobros.ayudaMotivo')}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={enviando}>
          {enviando ? t('cobros.registrando') : t('cobros.registrarCobro')}
        </Button>
      </div>

      <p aria-live="polite" className="text-destructive text-sm empty:hidden">
        {mensaje}
      </p>
    </form>
  );
}
