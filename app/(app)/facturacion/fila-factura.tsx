import { ExternalLink } from 'lucide-react';

import { formatearImporte } from '@/lib/dinero/importe';
import { formatearFechaSinZona } from '@/lib/fechas/relativo';
import { t, tCon } from '@/lib/i18n';

import { AccionesDeFactura } from './acciones-factura';
import type { FacturaListada } from './datos';

type Props = {
  factura: FacturaListada;
  zona: string;
  /** «Hoy» en la zona de la organización: la fecha tope del formulario de cobro. */
  hoy: string;
};

/**
 * Una factura del espejo (T-023b). Se enseña lo que el programa ya emitió (número, fecha, total, enlace) y lo que
 * aquí se ha cobrado contra ella. **Ni «pagada» ni estado**: si lo cobrado cuadra con el total lo dirá el programa,
 * no esta pantalla (ADR-077). **Ningún control edita número ni importe** (CA12): se enlaza un cobro, no se toca la factura.
 */
export function FilaFactura({ factura, zona, hoy }: Props) {
  const nombre = `${factura.nombre} ${factura.apellidos}`.trim() || t('cobros.facturas.pacienteSinNombre');
  const nombreOrdenado = `${factura.apellidos}, ${factura.nombre}`.replace(/^, |, $/g, '').trim() || nombre;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words text-foreground">{nombre}</p>
          <p className="text-xs break-words text-muted-foreground">
            {tCon('cobros.facturas.emitidaEn', { programa: factura.programa, numero: factura.numero })}
          </p>
          <p className="text-xs text-muted-foreground">{formatearFechaSinZona(factura.fecha, zona)}</p>
        </div>
        <span className="shrink-0 font-serif text-sm font-medium text-foreground tabular-nums">
          {formatearImporte(factura.totalCentimos)}
        </span>
      </div>

      {factura.url && (
        <a
          href={factura.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-primary underline underline-offset-2"
        >
          {tCon('cobros.facturas.verEnPrograma', { programa: factura.programa })}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}

      {factura.cobros.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('cobros.facturas.sinCobros')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {factura.cobros.map((cobro) => (
            <li key={cobro.id} data-testid="cobro-de-factura" className="flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0 flex-1 text-muted-foreground">
                <p className="break-words">
                  {[
                    formatearFechaSinZona(cobro.fecha, zona),
                    t(`cobros.formas.${cobro.formaPago}`),
                    ...(cobro.referencia ? [cobro.referencia] : []),
                  ].join(' · ')}
                </p>
                {cobro.importeCentimos < 0 && cobro.motivo && (
                  <p className="break-words">{tCon('cobros.facturas.devolucion', { motivo: cobro.motivo })}</p>
                )}
              </div>
              <span className="shrink-0 font-medium text-foreground tabular-nums">
                {formatearImporte(cobro.importeCentimos)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!factura.fusionado && (
        <AccionesDeFactura
          factura={{ id: factura.id, numero: factura.numero, pacienteId: factura.pacienteId, paciente: nombreOrdenado }}
          cobrosSinFactura={factura.cobrosSinFactura}
          zona={zona}
          hoy={hoy}
        />
      )}
    </li>
  );
}
