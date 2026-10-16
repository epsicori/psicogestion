'use client';

import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Dialogo } from '@/components/ui/dialogo';
import { t } from '@/lib/i18n';

type Props = {
  abierto: boolean;
  enviando: boolean;
  /** Texto ya resuelto del error de la última confirmación, o vacío. */
  error: string;
  alConfirmar: () => void;
  alCerrar: () => void;
};

/**
 * Descartar es una versión nueva con la marca, no un borrado: se confirma. El foco empieza en
 * «Cancelar» y vuelve al botón «Descartar» al cerrar (lo hace `Dialogo`). Los botones usan
 * `aria-disabled`, no `disabled`, para no soltar el foco a BODY mientras se envía (T-028 H27).
 */
export function DialogoDescartar({ abierto, enviando, error, alConfirmar, alCerrar }: Props) {
  const cancelar = useRef<HTMLButtonElement>(null);

  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo={t('facturacion.borrador.descartarTitulo')} focoInicial={cancelar}>
      <div className="flex flex-col gap-4">
        <p className="text-sm">{t('facturacion.borrador.descartarTexto')}</p>
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
            {enviando ? t('comunes.cargando') : t('facturacion.borrador.descartarConfirmar')}
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
            {t('facturacion.borrador.cancelar')}
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}
