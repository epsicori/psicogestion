'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Casilla } from '@/components/ui/casilla';
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
 * —incluidos sus `.refine`: el técnico exige un centro, sin repetidos, y con centros hay
 * un principal que está entre ellos—. No hay una segunda copia de esas reglas aquí.
 *
 * T-041: el técnico elige UN centro con el desplegable de siempre. El profesional y el
 * administrador marcan los centros donde atienden; con dos o más, eligen cuál es el
 * principal, que decide dónde quedan sus pacientes futuros. El principal nunca se elige
 * en silencio: con dos o más casillas empieza vacío, y desmarcarlo lo vacía.
 */
export function FormularioInvitar({ centros }: Props) {
  const [enviando, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState('');
  // La invitación salió pero quedan altas por dar: no se pinta como éxito.
  const [aviso, setAviso] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitted },
  } = useForm<DatosInvitacion>({
    resolver: zodResolver(esquemaInvitacion),
    defaultValues: {
      correo: '',
      nombreCompleto: '',
      rol: 'profesional_sanitario',
      centrosIds: [],
      centroPrincipalId: null,
    },
  });

  // useWatch y no watch(): watch() no se puede memoizar y el compilador de React lo
  // avisa (react-hooks/incompatible-library).
  const rol = useWatch({ control, name: 'rol' });
  const centrosIds = useWatch({ control, name: 'centrosIds' });
  const centroPrincipalId = useWatch({ control, name: 'centroPrincipalId' });
  const esTecnico = rol === 'tecnico_administrativo';

  // Antes del primer envío no se enseñan errores al tocar; después, sí se revalida.
  const opciones = { shouldValidate: isSubmitted };

  function fijarCentros(nuevos: string[], principal: string | null) {
    setValue('centrosIds', nuevos, opciones);
    setValue('centroPrincipalId', principal, opciones);
  }

  function alternarCentro(id: string, marcado: boolean) {
    const conjunto = new Set(centrosIds);
    if (marcado) conjunto.add(id);
    else conjunto.delete(id);
    // En el orden de la lista, no en el de los clics: lo que llega a la acción no depende
    // de cómo se marcó.
    const nuevos = centros.filter((c) => conjunto.has(c.valor)).map((c) => c.valor);

    let principal: string | null;
    if (nuevos.length === 0) principal = null;
    else if (nuevos.length === 1) principal = nuevos[0];
    // Al pasar de uno a dos, el principal que se puso solo deja de valer: hay que elegirlo.
    else if (centrosIds.length <= 1) principal = null;
    // Con dos o más, se conserva el elegido solo si sigue marcado.
    else principal = centroPrincipalId !== null && nuevos.includes(centroPrincipalId) ? centroPrincipalId : null;

    fijarCentros(nuevos, principal);
  }

  const enviar = handleSubmit((datos) => {
    setMensaje('');
    setAviso(false);
    iniciarTransicion(async () => {
      const estado = (await invitar(datos)) ?? ESTADO_INICIAL;
      aplicarErroresDelServidor(estado, setError);
      setMensaje(estado.mensaje ?? '');
      setAviso(Boolean(estado.avisoPendiente));
    });
  });

  const errorCentros = errors.centrosIds?.message;
  const errorPrincipal = errors.centroPrincipalId?.message;
  const opcionesPrincipal = centros.filter((c) => centrosIds.includes(c.valor));

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
          setValue('rol', valor as DatosInvitacion['rol'], opciones);
          // Cambiar de rol vacía siempre los centros: un técnico no hereda varias
          // casillas, ni un profesional el centro que se eligió para un técnico.
          fijarCentros([], null);
        }}
      />

      {esTecnico ? (
        <div className="flex flex-col gap-1.5">
          <Desplegable
            etiqueta={t('invitar.formulario.centro')}
            opciones={centros}
            valor={centrosIds[0] ?? null}
            alElegir={(valor) => fijarCentros([valor], valor)}
          />
          <p className="text-muted-foreground text-sm">{t('invitar.formulario.centroAyuda')}</p>
          {errorCentros && (
            <p id="centrosIds-error" className="text-destructive text-sm">
              {errorCentros}
            </p>
          )}
        </div>
      ) : (
        <fieldset
          className="flex flex-col gap-1.5"
          aria-describedby={errorCentros ? 'centros-ayuda centrosIds-error' : 'centros-ayuda'}
        >
          <legend className="mb-1 text-sm font-medium">{t('invitar.formulario.centros')}</legend>
          {centros.map((centro) => (
            <Casilla
              key={centro.valor}
              etiqueta={centro.etiqueta}
              checked={centrosIds.includes(centro.valor)}
              onChange={(evento) => alternarCentro(centro.valor, evento.target.checked)}
            />
          ))}
          <p id="centros-ayuda" className="text-muted-foreground text-sm">
            {t('invitar.formulario.centrosAyuda')}
          </p>
          {errorCentros && (
            <p id="centrosIds-error" className="text-destructive text-sm">
              {errorCentros}
            </p>
          )}

          {centrosIds.length >= 2 && (
            <div className="mt-2 flex flex-col gap-1.5">
              <Desplegable
                etiqueta={t('invitar.formulario.centroPrincipal')}
                opciones={opcionesPrincipal}
                valor={centroPrincipalId}
                alElegir={(valor) => setValue('centroPrincipalId', valor, opciones)}
              />
              <p className="text-muted-foreground text-sm">
                {t('invitar.formulario.centroPrincipalAyuda')}
              </p>
            </div>
          )}
          {errorPrincipal && (
            <p id="centroPrincipalId-error" className="text-destructive text-sm">
              {errorPrincipal}
            </p>
          )}
        </fieldset>
      )}

      <Button type="submit" disabled={enviando}>
        {enviando ? t('comunes.cargando') : t('invitar.formulario.enviar')}
      </Button>

      {/* La región se monta siempre y se rellena después: una región viva que nace con el
          texto dentro no se anuncia de forma fiable. */}
      <div role="status">
        {mensaje && (
          <p
            data-aviso={aviso || undefined}
            className={
              aviso ? 'border-destructive text-destructive border-l-2 pl-3 text-sm font-medium' : 'text-sm'
            }
          >
            {mensaje}
          </p>
        )}
      </div>
    </form>
  );
}
