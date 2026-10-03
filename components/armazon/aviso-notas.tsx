import Link from 'next/link';

import { Pildora } from '@/components/ui/piezas';
import { cuantasDestacadas, type RecuentoNotas } from '@/lib/agenda/avisos';
import { tCon } from '@/lib/i18n';

/**
 * Aviso persistente de la cabecera (T-015 §1.6): cuántas notas **mías** llevan más de un día
 * sin firmar (niveles 2 y 3; el nivel 1 es la presencia discreta de Agenda, P2). Sin dato no
 * hay control: con cero no se pinta nada. Sin estado: lo pinta el servidor.
 */
export function AvisoNotas({ recuento }: { recuento: RecuentoNotas }) {
  const n = cuantasDestacadas(recuento);
  if (n === 0) return null;

  const etiqueta = tCon(
    n === 1 ? 'avisos.notas.etiqueta.una' : 'avisos.notas.etiqueta.varias',
    { n },
  );

  return (
    <Link
      href="/agenda"
      aria-label={etiqueta}
      className="focus-visible:ring-ring/50 hover:bg-muted inline-flex min-h-11 items-center rounded-lg px-2 outline-none focus-visible:ring-2"
    >
      <Pildora tono="warning">
        <span aria-hidden="true">{n}</span>
      </Pildora>
    </Link>
  );
}
