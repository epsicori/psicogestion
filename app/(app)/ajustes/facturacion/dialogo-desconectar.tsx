'use client';

import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Dialogo } from '@/components/ui/dialogo';
import { t, tCon } from '@/lib/i18n';

type Props = {
  abierto: boolean;
  programa: string;
  enviando: boolean;
  /** Texto ya resuelto del error de la última confirmación, o vacío. */
  error: string;
  alConfirmar: () => void;
  alCerrar: () => void;
};

/**
 * Desconectar borra la clave del Vault, así que se confirma. El foco empieza en «Cancelar»
 * y los botones usan `aria-disabled` (no `disabled`): un botón con foco que pasa a deshabilitado
 * lo suelta a BODY y el diálogo pierde el foco (patrón T-028 H27).
 */
export function DialogoDesconectar({ abierto, programa, enviando, error, alConfirmar, alCerrar }: Props) {
  const cancelar = useRef<HTMLButtonElement>(null);

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={t('ajustes.facturacion.desconectar')}
      focoInicial={cancelar}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm">{tCon('ajustes.facturacion.desconectarConfirmar', { programa })}</p>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              if (!enviando) alConfirmar();
            }}
            aria-disabled={enviando || undefined}
            className="aria-disabled:opacity-50"
          >
            {enviando ? t('comunes.cargando') : t('ajustes.facturacion.desconectar')}
          </Button>
          <Button
            ref={cancelar}
            variante="contorno"
            onClick={() => {
              if (!enviando) alCerrar();
            }}
            aria-disabled={enviando || undefined}
            className="aria-disabled:opacity-50"
          >
            {t('ajustes.confirmacion.cancelar')}
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}
