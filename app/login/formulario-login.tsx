'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { t } from '@/lib/i18n';
import { ESTADO_INICIAL } from '@/lib/formularios';

import { iniciarSesion } from './acciones';

export function FormularioLogin() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <Field
        id="correo"
        name="correo"
        type="email"
        required
        autoComplete="email"
        etiqueta={t('acceso.correo')}
        errores={estado.errores?.correo}
      />

      <Field
        id="contrasena"
        name="contrasena"
        type="password"
        required
        autoComplete="current-password"
        etiqueta={t('acceso.contrasena')}
        errores={estado.errores?.contrasena}
      />

      <p aria-live="polite" className="text-destructive text-sm empty:hidden">
        {estado.mensaje}
      </p>

      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? t('acceso.entrando') : t('acceso.entrar')}
      </Button>
    </form>
  );
}
