'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { t, tCon, type ClaveDeCatalogo } from '@/lib/i18n';

import { desconectarProveedor, guardarClaveProveedor, probarConexion } from './acciones';
import { DialogoDesconectar } from './dialogo-desconectar';
import { esquemaClaveProveedor, type DatosClaveProveedor } from './esquemas';

type Props = {
  proveedor: DatosClaveProveedor['proveedor'];
  /** El nombre del programa, de su ficha: nunca escrito en una clave de texto. */
  programa: string;
  conectado: boolean;
};

const CLAVE_DE_ERROR: Record<string, ClaveDeCatalogo> = {
  clave_invalida: 'ajustes.facturacion.errores.clave_invalida',
  sin_permiso: 'ajustes.facturacion.errores.sin_permiso',
  fallo: 'ajustes.facturacion.errores.fallo',
  red: 'ajustes.facturacion.errores.red',
  limite: 'ajustes.facturacion.errores.limite',
  no_autorizado: 'ajustes.facturacion.errores.no_autorizado',
  sin_plan: 'ajustes.facturacion.errores.sin_plan',
  rechazado: 'ajustes.facturacion.errores.rechazado',
  ambiguo: 'ajustes.facturacion.errores.ambiguo',
  no_disponible: 'ajustes.facturacion.errores.no_disponible',
  sin_programa: 'ajustes.facturacion.errores.no_disponible',
};

function textoDeError(codigo: string, programa: string): string {
  return tCon(CLAVE_DE_ERROR[codigo] ?? 'ajustes.facturacion.errores.fallo', { programa });
}

/**
 * La clave es un secreto: el campo es `type="password"`, no tiene valor inicial, se vacía en cuanto
 * se guarda y la acción no devuelve nunca la clave (solo un código). La longitud y el formato los
 * comprueba el mismo esquema que valida en la Server Action.
 */
export function FormularioClave({ proveedor, programa, conectado }: Props) {
  const [enviando, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState('');
  const [errorGeneral, setErrorGeneral] = useState('');
  const [desconectando, setDesconectando] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DatosClaveProveedor>({
    resolver: zodResolver(esquemaClaveProveedor),
    defaultValues: { proveedor, clave: '' },
  });

  const guardar = handleSubmit((datos) => {
    setMensaje('');
    setErrorGeneral('');
    iniciarTransicion(async () => {
      const resultado = await guardarClaveProveedor(datos);
      if (resultado.ok) {
        reset({ proveedor, clave: '' });
        setMensaje(t('ajustes.facturacion.guardada'));
      } else {
        setErrorGeneral(textoDeError(resultado.error, programa));
      }
    });
  });

  const probar = () => {
    setMensaje('');
    setErrorGeneral('');
    iniciarTransicion(async () => {
      const resultado = await probarConexion();
      if (resultado.ok) setMensaje(tCon('ajustes.facturacion.conexionCorrecta', { programa }));
      else setErrorGeneral(textoDeError(resultado.error, programa));
    });
  };

  const desconectar = () => {
    setErrorDialogo('');
    iniciarTransicion(async () => {
      const resultado = await desconectarProveedor();
      if (resultado.ok) {
        setDesconectando(false);
        setMensaje(t('ajustes.facturacion.desconectado'));
      } else {
        setErrorDialogo(textoDeError(resultado.error, programa));
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
        <Field
          id="clave-proveedor"
          etiqueta={tCon('ajustes.facturacion.clave', { programa })}
          type="password"
          autoComplete="off"
          spellCheck={false}
          errores={errors.clave?.message ? [errors.clave.message] : undefined}
          {...register('clave')}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" aria-disabled={enviando || undefined} className="aria-disabled:opacity-50">
            {enviando ? t('comunes.cargando') : t('ajustes.facturacion.guardar')}
          </Button>
          {conectado && (
            <>
              <Button
                type="button"
                variante="contorno"
                onClick={() => {
                  if (!enviando) probar();
                }}
                aria-disabled={enviando || undefined}
                className="aria-disabled:opacity-50"
              >
                {t('ajustes.facturacion.probar')}
              </Button>
              <Button
                type="button"
                variante="contorno"
                onClick={() => setDesconectando(true)}
                aria-disabled={enviando || undefined}
                className="aria-disabled:opacity-50"
              >
                {t('ajustes.facturacion.desconectar')}
              </Button>
            </>
          )}
        </div>
      </form>

      {errorGeneral && (
        <p role="alert" className="text-destructive text-sm">
          {errorGeneral}
        </p>
      )}
      {mensaje && (
        <p role="status" className="text-sm">
          {mensaje}
        </p>
      )}

      <DialogoDesconectar
        abierto={desconectando}
        programa={programa}
        enviando={enviando}
        error={errorDialogo}
        alConfirmar={desconectar}
        alCerrar={() => {
          setDesconectando(false);
          setErrorDialogo('');
        }}
      />
    </div>
  );
}
