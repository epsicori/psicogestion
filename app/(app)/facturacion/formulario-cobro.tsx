'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
  /** Se llama con `true` al empezar un envío y con `false` al acabar (el diálogo no se cierra a mitad). */
  alCambiarEnvio?: (enviando: boolean) => void;
};

type CampoCobro = 'pacienteId' | 'importe' | 'fecha' | 'formaPago' | 'referencia' | 'motivo';
/** El orden en que se pintan los campos: el foco va al primero con error. */
const ORDEN_DE_CAMPOS: CampoCobro[] = ['pacienteId', 'importe', 'fecha', 'formaPago', 'referencia', 'motivo'];

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
export function FormularioCobro({ pacientes, hoy, alRegistrar, alCambiarEnvio }: Props) {
  const router = useRouter();
  const [enviando, iniciarTransicion] = useTransition();
  const enviandoRef = useRef(false);
  const [mensaje, setMensaje] = useState('');
  const [campoConFoco, setCampoConFoco] = useState<{ campo: CampoCobro } | null>(null);
  const esquema = useMemo(() => crearEsquemaCobro(hoy), [hoy]);

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    control,
    formState: { errors },
  } = useForm<EntradaCobro, unknown, DatosCobro>({
    resolver: zodResolver(esquema),
    defaultValues: { pacienteId: '', importe: '', fecha: hoy, referencia: '', motivo: '' },
  });

  // useWatch y no watch(): watch() no se puede memoizar y el compilador de React lo salta.
  const devolucion = esNegativo(useWatch({ control, name: 'importe' }));

  // El diálogo necesita saber si hay un envío en vuelo para no cerrarse con Escape (B-H11).
  useEffect(() => {
    alCambiarEnvio?.(enviando);
  }, [enviando, alCambiarEnvio]);

  // El foco va al primer campo con error del servidor, cuando el envío ya ha terminado (B-H2).
  useEffect(() => {
    if (campoConFoco && !enviando) setFocus(campoConFoco.campo);
  }, [campoConFoco, enviando, setFocus]);

  function alSerValido(datos: DatosCobro) {
    // aria-disabled no impide el clic ni el Enter: la guarda es esta, no el atributo.
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setMensaje('');
    setCampoConFoco(null);
    iniciarTransicion(async () => {
      try {
        const estado = (await registrarCobro(datos)) ?? ESTADO_INICIAL;
        if (!estado.errores && estado.mensaje === t('cobros.cobroRegistrado')) {
          alRegistrar();
          return;
        }
        aplicarErroresDelServidor(estado, setError);
        const primero = ORDEN_DE_CAMPOS.find((campo) => estado.errores?.[campo]?.length);
        if (primero) setCampoConFoco({ campo: primero });
        setMensaje(estado.errores ? '' : (estado.mensaje ?? t('cobros.noSePudoRegistrar')));
      } catch {
        // Un fallo de red o un 500 no dice si el cobro se registró: se avisa de que se compruebe
        // y se refresca la lista, sin desmontar el formulario ni perder lo escrito (B-H1).
        setMensaje(t('cobros.resultadoDesconocido'));
        router.refresh();
      } finally {
        enviandoRef.current = false;
      }
    });
  }

  const errorDe = (mensajeError: string | undefined) => (mensajeError ? [mensajeError] : undefined);

  return (
    <form onSubmit={(evento) => handleSubmit(alSerValido)(evento)} noValidate className="flex flex-col gap-4">
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
        <Button type="submit" aria-disabled={enviando} className="aria-disabled:opacity-60">
          {enviando ? t('cobros.registrando') : t('cobros.registrarCobro')}
        </Button>
      </div>

      <p aria-live="polite" className="text-destructive text-sm empty:hidden">
        {mensaje}
      </p>
    </form>
  );
}
