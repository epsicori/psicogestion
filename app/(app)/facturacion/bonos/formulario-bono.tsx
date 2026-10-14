'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Seleccion } from '@/components/ui/seleccion';
import { ESTADO_INICIAL, aplicarErroresDelServidor } from '@/lib/formularios';
import { t } from '@/lib/i18n';

import { registrarBono } from './acciones';
import { crearEsquemaBono, huellaDeBono, type DatosBono, type EntradaBono } from './esquemas';

type Props = {
  /** La lista para elegir paciente (módulo Facturación). Sin ella, `pacienteFijo` (ficha del paciente). */
  pacientes?: { id: string; nombre: string; apellidos: string }[];
  pacienteFijo?: { id: string; nombre: string };
  /** «Hoy» en la zona de la organización, calculado en servidor (ADR-034). */
  hoy: string;
  /** El id de envío de esa huella: el mismo mientras no haya un éxito (lo guarda `RegistrarBono`). */
  claveDeEnvio: (huella: string) => string;
  /** La acción confirma que el bono existe, con la huella del envío y el texto que hay que anunciar. */
  alRegistrar: (huella: string, aviso: string) => void;
  /** `true` al empezar un envío y `false` al acabar (el diálogo no se cierra a mitad). */
  alCambiarEnvio?: (enviando: boolean) => void;
};

type CampoBono = 'pacienteId' | 'sesionesTotales' | 'importe' | 'caducidad';
/** El orden en que se pintan los campos: el foco va al primero con error. */
const ORDEN_DE_CAMPOS: CampoBono[] = ['pacienteId', 'sesionesTotales', 'importe', 'caducidad'];

/** Las dos respuestas que confirman que el bono existe: las dos cierran y olvidan la clave. */
const MENSAJES_DE_EXITO = [t('bonos.bonoRegistrado'), t('bonos.bonoYaRegistrado')];

/**
 * Registrar un bono (T-027 §1.4), calcado de `formulario-cobro.tsx`: el mismo esquema en cliente y en la
 * acción, y a la acción va la SALIDA del esquema. Aquí no se cobra ni se factura nada (ADR-053).
 */
export function FormularioBono({ pacientes = [], pacienteFijo, hoy, claveDeEnvio, alRegistrar, alCambiarEnvio }: Props) {
  const [enviando, iniciarTransicion] = useTransition();
  const enviandoRef = useRef(false);
  const [mensaje, setMensaje] = useState('');
  const [campoConFoco, setCampoConFoco] = useState<{ campo: CampoBono } | null>(null);
  const esquema = useMemo(() => crearEsquemaBono(hoy), [hoy]);

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<EntradaBono, unknown, DatosBono>({
    resolver: zodResolver(esquema),
    defaultValues: { pacienteId: pacienteFijo?.id ?? '', sesionesTotales: '', importe: '', caducidad: '' },
  });

  useEffect(() => {
    alCambiarEnvio?.(enviando);
  }, [enviando, alCambiarEnvio]);

  // El foco va al primer campo con error del servidor, cuando el envío ya ha terminado.
  useEffect(() => {
    if (campoConFoco && !enviando) setFocus(campoConFoco.campo);
  }, [campoConFoco, enviando, setFocus]);

  function alSerValido(datos: DatosBono) {
    // aria-disabled no impide el clic ni el Enter: la guarda es esta, no el atributo.
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setMensaje('');
    setCampoConFoco(null);
    const huella = huellaDeBono(datos);
    const id = claveDeEnvio(huella);
    iniciarTransicion(async () => {
      try {
        const estado = (await registrarBono({ ...datos, id })) ?? ESTADO_INICIAL;
        if (!estado.errores && estado.mensaje !== undefined && MENSAJES_DE_EXITO.includes(estado.mensaje)) {
          // Solo un éxito olvida la clave: un bono igual registrado después es otro bono.
          alRegistrar(huella, estado.mensaje);
          return;
        }
        aplicarErroresDelServidor(estado, setError);
        const primero = ORDEN_DE_CAMPOS.find((campo) => estado.errores?.[campo]?.length);
        if (primero) setCampoConFoco({ campo: primero });
        setMensaje(estado.errores ? '' : (estado.mensaje ?? t('bonos.noSePudoRegistrar')));
      } catch {
        // Un fallo de red o un 500 no dice si el bono se registró: se avisa y se deja reintentar con la misma clave.
        setMensaje(t('bonos.resultadoDesconocido'));
      } finally {
        enviandoRef.current = false;
      }
    });
  }

  const errorDe = (mensajeError: string | undefined) => (mensajeError ? [mensajeError] : undefined);

  return (
    <form onSubmit={(evento) => handleSubmit(alSerValido)(evento)} noValidate className="flex flex-col gap-4">
      {pacienteFijo ? (
        <div className="flex flex-col gap-0.5 text-sm">
          <span className="text-foreground text-xs">{t('bonos.paciente')}</span>
          <span className="text-foreground">{pacienteFijo.nombre}</span>
          <input type="hidden" {...register('pacienteId')} />
        </div>
      ) : (
        <Seleccion
          id="pacienteId"
          etiqueta={t('bonos.paciente')}
          textoVacio={t('bonos.eligePaciente')}
          opciones={pacientes.map((p) => ({ valor: p.id, texto: `${p.apellidos}, ${p.nombre}` }))}
          errores={errorDe(errors.pacienteId?.message)}
          {...register('pacienteId')}
        />
      )}

      <Field
        id="sesionesTotales"
        type="text"
        inputMode="numeric"
        etiqueta={t('bonos.sesiones')}
        className="w-full"
        errores={errorDe(errors.sesionesTotales?.message)}
        {...register('sesionesTotales')}
      />

      <div className="flex flex-col gap-1">
        <Field
          id="importe"
          type="text"
          inputMode="decimal"
          etiqueta={t('bonos.importe')}
          className="w-full"
          errores={errorDe(errors.importe?.message)}
          aria-describedby={errors.importe?.message ? 'importe-error importe-ayuda' : 'importe-ayuda'}
          {...register('importe')}
        />
        <p id="importe-ayuda" className="text-xs text-muted-foreground">
          {t('bonos.ayudaImporte')}
        </p>
      </div>

      <Field
        id="caducidad"
        type="date"
        min={hoy}
        etiqueta={t('bonos.caducidad')}
        className="w-full"
        errores={errorDe(errors.caducidad?.message)}
        {...register('caducidad')}
      />

      <div className="flex justify-end">
        <Button type="submit" aria-disabled={enviando} className="aria-disabled:opacity-60">
          {enviando ? t('bonos.registrando') : t('bonos.registrarBono')}
        </Button>
      </div>

      <p aria-live="polite" className="text-destructive text-sm">
        {mensaje}
      </p>
    </form>
  );
}
