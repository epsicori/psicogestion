'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { esquemaRegenerarCodigos, type DatosRegenerarCodigos } from '@/lib/cuentas/esquemas';
import { aplicarErroresDelServidor } from '@/lib/formularios';
import { t } from '@/lib/i18n';

import { regenerarCodigos } from './acciones';
import { ID_TITULO_AVISOS } from './ids';

type Vista = { tipo: 'formulario' } | { tipo: 'codigos'; codigos: string[] } | { tipo: 'fallo'; mensaje: string };

/**
 * Regenerar mis códigos de recuperación (T-038).
 *
 * `esquemaRegenerarCodigos` es EL MISMO objeto que valida la Server Action. Tras CADA
 * envío que llega a la acción, con éxito o con error, los dos campos se vacían: la
 * contraseña no se queda ni en el estado del formulario ni en el DOM.
 *
 * Los códigos nuevos y los fallos sustituyen al formulario en una región con nombre y
 * descripción, y el foco se lleva a ella al aparecer (mismo molde en las cuatro vistas
 * de código/fallo del ticket). Nada de temporizadores: seguir es cosa del usuario.
 */
export function FormularioRegenerar() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [vista, setVista] = useState<Vista>({ tipo: 'formulario' });
  // Objeto nuevo en cada fallo, para que el efecto corra aunque el campo sea el mismo.
  const [campoConFoco, setCampoConFoco] = useState<{ campo: 'contrasena' | 'codigo' } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<DatosRegenerarCodigos>({
    resolver: zodResolver(esquemaRegenerarCodigos),
    defaultValues: { contrasena: '', codigo: '' },
  });

  useEffect(() => {
    if (campoConFoco && !enviando) setFocus(campoConFoco.campo);
  }, [campoConFoco, enviando, setFocus]);

  const enviar = handleSubmit(async (datos) => {
    setEnviando(true);
    try {
      const estado = (await regenerarCodigos(datos)) ?? {};
      reset({ contrasena: '', codigo: '' });

      if (estado.codigos) {
        setVista({ tipo: 'codigos', codigos: estado.codigos });
        return;
      }

      if (estado.errores) {
        aplicarErroresDelServidor(estado, setError);
        // El foco se lleva en un efecto, cuando ya se ha pintado el error y el botón
        // vuelve a estar habilitado: hacerlo aquí dentro lo pierde (sigue deshabilitado).
        const primero = (['contrasena', 'codigo'] as const).find((campo) => estado.errores?.[campo]?.[0]);
        if (primero) setCampoConFoco({ campo: primero });
        return;
      }

      setVista({ tipo: 'fallo', mensaje: estado.mensaje ?? t('cuenta.errores.generico') });
    } catch {
      // La acción se rechazó (red, servidor): ni la contraseña se queda ni el fallo se calla (B-H2).
      reset({ contrasena: '', codigo: '' });
      setVista({ tipo: 'fallo', mensaje: t('cuenta.errores.generico') });
    } finally {
      // Mismo lote que el error y el foco: el botón vuelve a estar habilitado cuando el foco llega.
      setEnviando(false);
    }
  });

  if (vista.tipo === 'codigos') {
    return (
      <VistaConFoco titulo={t('cuenta.codigos.titulo')} descripcion={t('cuenta.codigos.aviso')}>
        <ul className="border-border bg-muted grid grid-cols-2 gap-2 rounded-lg border p-4 font-mono text-sm">
          {vista.codigos.map((uno) => (
            <li key={uno}>{uno}</li>
          ))}
        </ul>
        <Button
          onClick={() => {
            setVista({ tipo: 'formulario' });
            router.refresh();
            document.getElementById(ID_TITULO_AVISOS)?.focus();
          }}
        >
          {t('cuenta.codigos.guardados')}
        </Button>
      </VistaConFoco>
    );
  }

  if (vista.tipo === 'fallo') {
    return (
      <VistaConFoco titulo={t('cuenta.fallo.titulo')} descripcion={vista.mensaje}>
        <Button
          onClick={() => {
            setVista({ tipo: 'formulario' });
            // El efecto de arriba lleva el foco al campo cuando el formulario vuelve (B-H9).
            setCampoConFoco({ campo: 'contrasena' });
          }}
        >
          {t('cuenta.fallo.volver')}
        </Button>
      </VistaConFoco>
    );
  }

  return (
    <form noValidate onSubmit={enviar} className="flex flex-col gap-4">
      <h3 className="font-serif text-lg font-semibold tracking-tight">{t('cuenta.regenerar.titulo')}</h3>
      <p className="text-muted-foreground text-sm">{t('cuenta.regenerar.aviso')}</p>

      <Field
        id="contrasena"
        type="password"
        autoComplete="current-password"
        etiqueta={t('cuenta.regenerar.contrasena')}
        errores={errors.contrasena?.message ? [errors.contrasena.message] : undefined}
        {...register('contrasena')}
      />

      <Field
        id="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        etiqueta={t('cuenta.regenerar.codigo')}
        errores={errors.codigo?.message ? [errors.codigo.message] : undefined}
        {...register('codigo')}
      />

      <Button type="submit" disabled={enviando}>
        {enviando ? t('comunes.cargando') : t('cuenta.regenerar.enviar')}
      </Button>
    </form>
  );
}

/** Región con nombre y descripción que recibe el foco al aparecer. */
function VistaConFoco({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}) {
  const idTitulo = useId();
  const idAviso = useId();
  const seccion = useRef<HTMLElement>(null);

  useEffect(() => {
    seccion.current?.focus();
  }, []);

  return (
    <section
      ref={seccion}
      tabIndex={-1}
      aria-labelledby={idTitulo}
      aria-describedby={idAviso}
      className="flex flex-col gap-4 outline-none"
    >
      <h3 id={idTitulo} className="font-serif text-lg font-semibold tracking-tight">
        {titulo}
      </h3>
      <p id={idAviso} className="text-muted-foreground text-sm">
        {descripcion}
      </p>
      {children}
    </section>
  );
}
