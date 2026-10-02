'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { t, tCon } from '@/lib/i18n';

import { resolverAlerta, type EstadoResolver } from './acciones-alertas';

/**
 * «Marcar como resuelta» de una alerta de documentación (T-015, decisión P1). Quien la pinta ya
 * ha comprobado `puedeResolverAlerta`. Sin confirmación: resolver no borra nada y queda auditado.
 *
 * El error va en un `role="status"` propio y no en `AvisoDeError`, que lleva `role="alert"`: un
 * fallo al marcar no interrumpe a nadie.
 */
export function ResolverAlerta({ alertaId, etiquetaTipo }: { alertaId: string; etiquetaTipo: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoResolver, FormData>(resolverAlerta, null);
  const fallo = estado !== null && !estado.ok;

  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="alertaId" value={alertaId} />
      <Button
        type="submit"
        variante="secundario"
        tamano="sm"
        disabled={pendiente}
        aria-label={pendiente ? undefined : tCon('agenda.documentacion.resolverEtiqueta', { tipo: etiquetaTipo })}
      >
        {pendiente ? t('agenda.documentacion.resolviendo') : t('agenda.documentacion.resolver')}
      </Button>
      <p role="status" className="text-xs text-destructive">
        {fallo ? t('agenda.documentacion.errorResolver') : null}
      </p>
    </form>
  );
}
