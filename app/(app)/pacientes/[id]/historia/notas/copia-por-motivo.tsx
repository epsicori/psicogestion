'use client';

import { FileLock2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { NotaParaCopia } from '@/lib/exportaciones/servidor';
import { t, tCon } from '@/lib/i18n';

import { DialogoDeCopia } from './dialogo-de-copia';

/**
 * T-040 · P2-a. La vista de una nota para la administración que no la lee: la fecha de la
 * sesión, el autor y cuántas versiones firmadas tiene. Nada del contenido. Desde aquí solo se
 * puede pedir una copia cifrada por motivo, que queda registrada y avisa a los profesionales.
 */
export function CopiaPorMotivo({ pacienteId, nota }: { pacienteId: string; nota: NotaParaCopia }) {
  const [abierto, setAbierto] = useState(false);
  const versiones =
    nota.versiones === 1
      ? tCon('exportaciones.motivo.versiones.una', { n: 1 })
      : tCon('exportaciones.motivo.versiones.varias', { n: nota.versiones });

  return (
    <section className="border-border bg-card flex flex-col gap-4 rounded-xl border p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <FileLock2 aria-hidden="true" className="text-muted-foreground size-5" />
        <span className="font-medium">{nota.fechaSesion}</span>
        <span className="text-sm">{nota.autor}</span>
        <span className="text-muted-foreground text-sm">{versiones}</span>
      </div>
      <p className="text-muted-foreground max-w-prose text-sm">{t('exportaciones.motivo.explicacion')}</p>
      <div>
        <Button type="button" onClick={() => setAbierto(true)}>
          {t('exportaciones.boton.pedirPorMotivo')}
        </Button>
      </div>
      <DialogoDeCopia
        pacienteId={pacienteId}
        notaId={nota.id}
        modo="motivo"
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
      />
    </section>
  );
}
