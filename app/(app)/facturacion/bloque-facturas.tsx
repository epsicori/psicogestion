import { FileText } from 'lucide-react';
import Form from 'next/form';

import { AvisoDeError, EstadoVacio } from '@/components/ui/piezas';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Seleccion } from '@/components/ui/seleccion';
import { t, tCon } from '@/lib/i18n';

import { TAMANO_PAGINA_FACTURAS, cargarContexto, cargarFacturas } from './datos';
import { FORMAS_DE_PAGO } from './esquemas';
import { hrefFacturacion } from './filtros-facturas';
import { FilaFactura } from './fila-factura';
import { PaginacionPendientes } from './paginacion-pendientes';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const OPCIONES_FORMA = FORMAS_DE_PAGO.map((forma) => ({ valor: forma, texto: t(`cobros.formas.${forma}`) }));

/**
 * Las facturas del programa de facturación y lo que se ha cobrado contra ellas (T-023b). Server Component:
 * los filtros viven en la URL (formulario GET), así que el listado se puede enlazar y el botón «atrás» funciona.
 * **No hay filtro por estado de cobro**: la factura no tiene estado de pago en la app (ADR-077).
 * Un filtro que no vale no se aplica en silencio: se dice (los avisos).
 */
export async function BloqueFacturas({ searchParams }: Props) {
  const { profesionalFiltrado, pagina: paginaPendiente, zona, hoy, filtrosFacturas } = await cargarContexto(searchParams);
  const resultado = await cargarFacturas(filtrosFacturas, profesionalFiltrado);

  const formulario = (
    <Form
      action="/facturacion"
      scroll={false}
      aria-label={t('cobros.facturas.filtrar')}
      className="flex flex-wrap items-end gap-3"
    >
      {profesionalFiltrado && <input type="hidden" name="profesional" value={profesionalFiltrado} />}
      <Field id="facturas-desde" name="desde" type="date" etiqueta={t('cobros.facturas.desde')} defaultValue={filtrosFacturas.desde} />
      <Field id="facturas-hasta" name="hasta" type="date" etiqueta={t('cobros.facturas.hasta')} defaultValue={filtrosFacturas.hasta} />
      <Seleccion
        id="facturas-forma"
        name="forma"
        etiqueta={t('cobros.facturas.formaPago')}
        textoVacio={t('cobros.facturas.todas')}
        opciones={OPCIONES_FORMA}
        defaultValue={filtrosFacturas.formaPago ?? ''}
      />
      <Button type="submit" variante="contorno">
        {t('cobros.facturas.filtrar')}
      </Button>
    </Form>
  );

  const avisos = filtrosFacturas.avisos.length > 0 && (
    <ul className="flex flex-col gap-1">
      {filtrosFacturas.avisos.map((aviso) => (
        <li key={aviso} className="text-xs font-medium text-accent-foreground">
          {t(`cobros.facturas.filtroNoAplicado.${aviso}`)}
        </li>
      ))}
    </ul>
  );

  if (!resultado.ok) {
    return (
      <>
        {formulario}
        {avisos}
        <AvisoDeError mensaje={t('cobros.facturas.error')} />
      </>
    );
  }

  const { facturas, total, pagina } = resultado;
  const ultima = Math.max(1, Math.ceil(total / TAMANO_PAGINA_FACTURAS));
  const hrefDe = (paginaFacturas: number) =>
    hrefFacturacion({
      profesional: profesionalFiltrado,
      pagina: paginaPendiente,
      paginaFacturas,
      explicitos: filtrosFacturas.explicitos,
    });

  return (
    <>
      {formulario}
      {avisos}
      {facturas.length === 0 ? (
        <EstadoVacio
          icono={<FileText className="size-5" aria-hidden="true" />}
          frase={t('cobros.facturas.vacio')}
          explicacion={t('cobros.facturas.vacioExplicacion')}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {facturas.map((factura) => (
            <FilaFactura key={factura.id} factura={factura} zona={zona} hoy={hoy} />
          ))}
        </ul>
      )}
      {total > TAMANO_PAGINA_FACTURAS && (
        <PaginacionPendientes
          nombre={t('cobros.facturas.paginacion')}
          pagina={pagina}
          rango={tCon('cobros.facturas.rango', {
            desde: (pagina - 1) * TAMANO_PAGINA_FACTURAS + 1,
            hasta: Math.min(pagina * TAMANO_PAGINA_FACTURAS, total),
            total,
          })}
          anterior={pagina > 1 ? hrefDe(pagina - 1) : null}
          siguiente={pagina < ultima ? hrefDe(pagina + 1) : null}
        />
      )}
    </>
  );
}
