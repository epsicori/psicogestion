'use client';

import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/**
 * La barra del pulgar (ADR-044): pegada abajo, por encima de la zona segura del dispositivo.
 * Solo pinta lo que tiene una acción real detrás: sin Comparar ni Descargar hasta el corte C.
 * Quien no puede escribir (no es el autor) recibe los tres en `false` y la barra queda vacía.
 */
export function BarraDeAcciones({
  puedeGuardar,
  puedeFirmar,
  puedeModificar,
  pendiente,
  alGuardar,
  alFirmar,
  alModificar,
}: {
  puedeGuardar: boolean;
  puedeFirmar: boolean;
  puedeModificar: boolean;
  pendiente: boolean;
  alGuardar: () => void;
  alFirmar: () => void;
  alModificar: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label={t('notas.editor.acciones')}
      className="border-border bg-background sticky bottom-0 flex flex-wrap justify-end gap-2 border-t px-4 pt-3 pb-[env(safe-area-inset-bottom)]"
    >
      {puedeGuardar && (
        <Button variante="contorno" onClick={alGuardar} disabled={pendiente}>
          {t('notas.editor.guardar')}
        </Button>
      )}
      {puedeModificar && (
        <Button variante="contorno" onClick={alModificar} disabled={pendiente}>
          {t('notas.editor.modificar')}
        </Button>
      )}
      {puedeFirmar && (
        <Button onClick={alFirmar} disabled={pendiente}>
          {t('notas.editor.firmar')}
        </Button>
      )}
    </div>
  );
}
