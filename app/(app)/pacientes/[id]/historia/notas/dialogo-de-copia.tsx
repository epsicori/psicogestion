'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Casilla } from '@/components/ui/casilla';
import { Dialogo } from '@/components/ui/dialogo';
import { cifrarCopia } from '@/lib/exportaciones/cifrar';
import { MOTIVOS, type MotivoExportacion } from '@/lib/exportaciones/constantes';
import { derivarEnTrabajador } from '@/lib/exportaciones/derivar-en-trabajador';
import type { MotivoFalloCopia } from '@/lib/exportaciones/servidor';
import { t, type ClaveDeCatalogo } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { pedirCopiaDeNota, registrarFicheroDeCopia } from './acciones-copia';
import {
  esquemaDialogoCopia,
  esquemaDialogoCopiaPorMotivo,
  type ValoresDialogoCopia,
} from './esquemas-copia';

/**
 * T-040 · El diálogo de la copia cifrada de una nota (diseño §1.4).
 *
 * El flujo: `editando` → `pidiendo` → `cifrando` → `registrando` → `descargada` | `error`.
 *
 * Lo que no se negocia:
 *  - La contraseña solo vive en este componente. Se toma del formulario al enviar, el formulario
 *    se vacía de inmediato y ninguna acción la recibe: sube la huella del fichero, no la clave.
 *  - Sin registro no hay descarga: si `registrarFicheroDeCopia` falla, el fichero no se ofrece.
 *  - Si el diálogo se cierra a medio camino, lo que llegue después se descarta (`vigente`): no se
 *    cifra, no se registra y no se descarga.
 */

type Fase = 'editando' | 'pidiendo' | 'cifrando' | 'registrando' | 'descargada' | 'error';

type Props = {
  pacienteId: string;
  notaId: string;
  modo: 'profesional' | 'motivo';
  abierto: boolean;
  alCerrar: () => void;
};

const VACIO: ValoresDialogoCopia = {
  motivo: null,
  referencia: '',
  contrasena: '',
  repeticion: '',
  entendido: false as unknown as true,
};

const MENSAJE_DE_FALLO: Record<MotivoFalloCopia, ClaveDeCatalogo> = {
  bloqueada: 'exportaciones.error.bloqueada',
  sin_permiso: 'exportaciones.error.sin_permiso',
  falta_motivo: 'exportaciones.error.falta_motivo',
  sin_versiones: 'exportaciones.error.sin_versiones',
  error: 'exportaciones.error.error',
};

const ETIQUETA_MOTIVO: Record<MotivoExportacion, ClaveDeCatalogo> = {
  peticion_paciente: 'exportaciones.copia.motivos.peticion_paciente',
  requerimiento_judicial_o_inspeccion: 'exportaciones.copia.motivos.requerimiento_judicial_o_inspeccion',
  traspaso_caso: 'exportaciones.copia.motivos.traspaso_caso',
};

const PROGRESO: Partial<Record<Fase, ClaveDeCatalogo>> = {
  pidiendo: 'exportaciones.estado.pidiendo',
  cifrando: 'exportaciones.estado.cifrando',
  registrando: 'exportaciones.estado.registrando',
  descargada: 'exportaciones.estado.descargada',
};

/** El fichero sale como descarga del navegador; la URL del Blob se revoca en cuanto se pulsa. */
function descargar(html: string, nombreFichero: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreFichero;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

const claseCampo = cn(
  'border-input bg-background h-10 rounded-lg border px-3 text-sm',
  'focus-visible:border-ring focus-visible:ring-ring/40 outline-none focus-visible:ring-2',
  'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
);

export function DialogoDeCopia({ pacienteId, notaId, modo, abierto, alCerrar }: Props) {
  const titulo =
    modo === 'motivo'
      ? t('exportaciones.dialogo.tituloMotivo')
      : t('exportaciones.dialogo.tituloProfesional');
  // `Dialogo` no monta a sus hijos cerrado: cada apertura empieza con un formulario nuevo y, al
  // cerrar, el contenido se desmonta y lo que estuviera en vuelo deja de ser vigente.
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo={titulo}>
      <ContenidoDeCopia pacienteId={pacienteId} notaId={notaId} modo={modo} alCerrar={alCerrar} />
    </Dialogo>
  );
}

function ContenidoDeCopia({ pacienteId, notaId, modo, alCerrar }: Omit<Props, 'abierto'>) {
  const prefijo = useId();
  const id = (campo: string) => `${prefijo}-${campo}`;
  const [fase, setFase] = useState<Fase>('editando');
  const [mensajeDeError, setMensajeDeError] = useState('');
  const refError = useRef<HTMLParagraphElement>(null);
  const refCerrar = useRef<HTMLButtonElement>(null);
  // Cada envío lleva su número; si el diálogo se cierra o se vuelve a enviar, el anterior deja de
  // ser vigente y sus resultados se descartan.
  const ejecucion = useRef(0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ValoresDialogoCopia>({
    resolver: zodResolver(modo === 'motivo' ? esquemaDialogoCopiaPorMotivo : esquemaDialogoCopia),
    defaultValues: VACIO,
  });

  // Al desmontar (el diálogo se cierra), lo que esté en vuelo deja de ser vigente.
  useEffect(() => {
    const contador = ejecucion;
    return () => {
      contador.current += 1;
    };
  }, []);

  useEffect(() => {
    if (fase === 'error') refError.current?.focus();
    if (fase === 'descargada') refCerrar.current?.focus();
  }, [fase]);

  const trabajando = fase === 'pidiendo' || fase === 'cifrando' || fase === 'registrando';

  const fallar = (clave: ClaveDeCatalogo) => {
    setMensajeDeError(t(clave));
    setFase('error');
  };

  const alEnviar = async (datos: ValoresDialogoCopia) => {
    if (trabajando) return;
    const mia = ++ejecucion.current;
    const vigente = () => ejecucion.current === mia;

    const motivo = modo === 'motivo' ? datos.motivo : null;
    const referencia = motivo === null ? null : datos.referencia.trim();
    const contrasena = datos.contrasena;
    // La contraseña sale del estado del formulario ya: solo queda en esta variable local.
    reset({ ...VACIO, motivo: datos.motivo, referencia: datos.referencia });

    setMensajeDeError('');
    setFase('pidiendo');
    try {
      const pedida = await pedirCopiaDeNota({
        pacienteId,
        notaId,
        motivo,
        referencia,
      });
      if (!vigente()) return;
      if (!pedida.ok) return fallar(MENSAJE_DE_FALLO[pedida.motivo]);

      setFase('cifrando');
      const { html, huellaHex } = await cifrarCopia(pedida.copia, contrasena, derivarEnTrabajador);
      if (!vigente()) return;

      setFase('registrando');
      const registro = await registrarFicheroDeCopia({
        pacienteId,
        exportacionId: pedida.exportacionId,
        huellaHex,
      });
      if (!vigente()) return;
      if (!registro.ok) {
        return fallar(
          registro.motivo === 'caducada'
            ? 'exportaciones.error.caducada'
            : 'exportaciones.error.noRegistrada',
        );
      }

      descargar(html, pedida.nombreFichero);
      reset(VACIO);
      setFase('descargada');
    } catch {
      if (vigente()) fallar('exportaciones.error.error');
    }
  };

  const progreso = PROGRESO[fase];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {modo === 'motivo' ? t('exportaciones.motivo.explicacion') : t('exportaciones.dialogo.explicacion')}
      </p>

      {fase === 'descargada' ? null : (
        <form
          noValidate
          onSubmit={(evento) => void handleSubmit(alEnviar)(evento)}
          className="flex flex-col gap-4"
        >
          {modo === 'motivo' && (
            <fieldset
              className="flex flex-col gap-2"
              aria-invalid={errors.motivo ? true : undefined}
              aria-describedby={errors.motivo ? id('motivo-error') : undefined}
            >
              <legend className="mb-1 text-sm font-medium">{t('exportaciones.dialogo.motivo')}</legend>
              {MOTIVOS.map((valor) => (
                <label key={valor} className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="radio"
                    value={valor}
                    className="accent-primary size-5"
                    {...register('motivo')}
                  />
                  {t(ETIQUETA_MOTIVO[valor])}
                </label>
              ))}
              {errors.motivo?.message && (
                <p id={id('motivo-error')} className="text-destructive text-sm">
                  {errors.motivo.message}
                </p>
              )}
            </fieldset>
          )}

          {modo === 'motivo' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={id('referencia')} className="text-sm font-medium">
                {t('exportaciones.dialogo.referencia')}
              </label>
              <input
                id={id('referencia')}
                type="text"
                autoComplete="off"
                maxLength={200}
                className={claseCampo}
                aria-invalid={errors.referencia ? true : undefined}
                aria-describedby={cn(id('referencia-ayuda'), errors.referencia && id('referencia-error'))}
                {...register('referencia')}
              />
              <p id={id('referencia-ayuda')} className="text-muted-foreground text-xs">
                {t('exportaciones.dialogo.referenciaAyuda')}
              </p>
              {errors.referencia?.message && (
                <p id={id('referencia-error')} className="text-destructive text-sm">
                  {errors.referencia.message}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={id('contrasena')} className="text-sm font-medium">
              {t('exportaciones.dialogo.contrasena')}
            </label>
            <input
              id={id('contrasena')}
              type="password"
              autoComplete="new-password"
              className={claseCampo}
              aria-invalid={errors.contrasena ? true : undefined}
              aria-describedby={cn(id('contrasena-ayuda'), errors.contrasena && id('contrasena-error'))}
              {...register('contrasena')}
            />
            <p id={id('contrasena-ayuda')} className="text-muted-foreground text-xs">
              {t('exportaciones.dialogo.contrasenaAyuda')}
            </p>
            {errors.contrasena?.message && (
              <p id={id('contrasena-error')} className="text-destructive text-sm">
                {errors.contrasena.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={id('repeticion')} className="text-sm font-medium">
              {t('exportaciones.dialogo.repeticion')}
            </label>
            <input
              id={id('repeticion')}
              type="password"
              autoComplete="new-password"
              className={claseCampo}
              aria-invalid={errors.repeticion ? true : undefined}
              aria-describedby={errors.repeticion ? id('repeticion-error') : undefined}
              {...register('repeticion')}
            />
            {errors.repeticion?.message && (
              <p id={id('repeticion-error')} className="text-destructive text-sm">
                {errors.repeticion.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Casilla
              id={id('entendido')}
              etiqueta={t('exportaciones.dialogo.entendido')}
              aria-invalid={errors.entendido ? true : undefined}
              aria-describedby={errors.entendido ? id('entendido-error') : undefined}
              {...register('entendido')}
            />
            {errors.entendido?.message && (
              <p id={id('entendido-error')} className="text-destructive text-sm">
                {errors.entendido.message}
              </p>
            )}
          </div>

          {fase === 'error' && (
            <p ref={refError} role="alert" tabIndex={-1} className="text-destructive text-sm outline-none">
              {mensajeDeError}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variante="contorno" onClick={alCerrar}>
              {t('exportaciones.boton.cancelar')}
            </Button>
            <Button type="submit" aria-disabled={trabajando || undefined}>
              {t('exportaciones.boton.cifrarYDescargar')}
            </Button>
          </div>
        </form>
      )}

      {/* Siempre en el árbol: una región viva que aparece con su texto no se anuncia. */}
      <p role="status" className="text-sm">
        {progreso ? t(progreso) : ''}
      </p>

      {fase === 'descargada' && (
        <div className="flex justify-end">
          <Button ref={refCerrar} type="button" onClick={alCerrar}>
            {t('exportaciones.boton.cerrar')}
          </Button>
        </div>
      )}
    </div>
  );
}
