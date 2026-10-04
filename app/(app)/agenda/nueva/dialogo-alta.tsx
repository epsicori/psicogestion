'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { Dialogo } from '@/components/ui/dialogo';
import { t } from '@/lib/i18n';

/**
 * El alta de cita abierta por encima de la agenda (ruta interceptada `@modal`). Cerrar es volver
 * atrás: el historial queda como estaba y el foco regresa a «Nueva cita» (o a la celda que lo abrió).
 */
export function DialogoAlta({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <Dialogo abierto alCerrar={() => router.back()} titulo={t('agenda.alta.titulo')} ancho="amplio">
      {children}
    </Dialogo>
  );
}
