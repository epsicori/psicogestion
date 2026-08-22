'use client';

import { Plus } from 'lucide-react';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ESTADO_INICIAL } from '@/lib/formularios';

import { crearPaciente } from './acciones';

export function FormularioNuevoPaciente() {
  const [estado, accion, enviando] = useActionState(crearPaciente, ESTADO_INICIAL);

  return (
    <form
      action={accion}
      className="border-border bg-card rounded-xl border p-5 shadow-sm"
    >
      <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-[0.16em] uppercase">
        Nuevo paciente
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Field
            id="nombre"
            name="nombre"
            type="text"
            required
            etiqueta="Nombre"
            className="w-full"
            errores={estado.errores?.nombre}
          />
        </div>

        <div className="flex-1">
          <Field
            id="apellidos"
            name="apellidos"
            type="text"
            required
            etiqueta="Apellidos"
            className="w-full"
            errores={estado.errores?.apellidos}
          />
        </div>

        <Button type="submit" disabled={enviando} className="sm:mt-7">
          <Plus />
          {enviando ? 'Creando…' : 'Crear paciente'}
        </Button>
      </div>

      <p aria-live="polite" className="text-destructive mt-3 text-sm empty:mt-0">
        {estado.mensaje}
      </p>
    </form>
  );
}
