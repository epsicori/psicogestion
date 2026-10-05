'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

import { DialogoDeCopia } from './dialogo-de-copia';

/**
 * T-040 · «Descargar copia»: la copia cifrada que saca el profesional que lee la nota. No se
 * deshabilita mientras el diálogo trabaja (H22): el diálogo es modal y el disparador queda debajo.
 */
export function BotonDeCopia({ pacienteId, notaId }: { pacienteId: string; notaId: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button type="button" variante="contorno" tamano="sm" onClick={() => setAbierto(true)}>
        <Download aria-hidden="true" className="size-4" />
        {t('exportaciones.boton.descargar')}
      </Button>
      <DialogoDeCopia
        pacienteId={pacienteId}
        notaId={notaId}
        modo="profesional"
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
      />
    </>
  );
}
