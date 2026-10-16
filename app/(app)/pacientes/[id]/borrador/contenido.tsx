import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatearImporte } from '@/lib/dinero/importe';
import { cargarEditor, cargarElegibles, type DatosEditor } from '@/lib/economico/borrador';
import { t, tCon } from '@/lib/i18n';

import { depsDeSesion } from './datos';
import { EditorBorrador } from './editor-borrador';

type Borrador = NonNullable<DatosEditor['borrador']>;

const EDITABLES = new Set<Borrador['estado']>(['sin_enviar', 'fallido']);

/**
 * Un borrador descartado o ya preparado en el programa (en cola, enviado, facturado) se enseña
 * **sin controles**: no admite versión nueva, y un botón que la base va a rechazar sería un
 * control sin acción detrás.
 */
export function VistaBorrador({ borrador, programa }: { borrador: Borrador; programa: string | null }) {
  const aviso =
    borrador.estado === 'descartado'
      ? t('facturacion.borrador.descartadoAviso')
      : programa
        ? tCon('facturacion.borrador.congelado', { programa })
        : t('facturacion.borrador.congeladoSinPrograma');
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm font-medium">
        {aviso}
      </p>
      <p className="text-muted-foreground text-sm">{tCon('facturacion.borrador.version', { n: borrador.numeroVersion })}</p>
      <p className="text-sm">{borrador.destinatarioNombre}</p>
      <ul className="divide-border flex flex-col divide-y text-sm">
        {borrador.lineas.map((l, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
            <span>
              {l.cantidad > 1 ? `${l.cantidad} × ` : ''}
              {l.concepto}
            </span>
            <span className="text-muted-foreground">
              {formatearImporte(l.precio_unitario_centimos)} ·{' '}
              {l.regimen_iva === 'general' ? t('facturacion.borrador.general') : t('facturacion.borrador.exento')}
            </span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">{t('facturacion.borrador.base')}</dt>
          <dd>{formatearImporte(borrador.base)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('facturacion.borrador.cuota')}</dt>
          <dd>{formatearImporte(borrador.cuota)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('facturacion.borrador.total')}</dt>
          <dd className="font-semibold">{formatearImporte(borrador.total)}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * La pantalla del editor (T-046), nueva o de corrección. `null` del núcleo es un 404: el técnico,
 * quien no es el profesional asignado, un paciente invisible o un borrador de otro paciente no
 * saben ni que existe. Nada de esto se guarda en caché (ADR-043).
 */
export async function ContenidoEditor({
  params,
}: {
  params: Promise<{ id: string; borradorId?: string }>;
}) {
  const { id, borradorId } = await params;
  const deps = await depsDeSesion();
  const datos = await cargarEditor(deps, id, borradorId);
  if (!datos) notFound();
  const { paciente, borrador } = datos;

  const editable = !borrador || EDITABLES.has(borrador.estado);
  const elegibles = editable ? await cargarElegibles(deps, paciente.id, borradorId) : [];
  if (elegibles === null) notFound();

  return (
    <>
      <Link
        href={`/pacientes/${paciente.id}`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mb-4 inline-flex min-h-11 items-center gap-1 text-sm outline-none focus-visible:ring-2"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t('facturacion.borrador.volver')}
      </Link>
      <h2 className="font-serif text-3xl font-semibold tracking-tight">
        {borrador ? t('facturacion.borrador.tituloCorregir') : t('facturacion.borrador.tituloNuevo')}
      </h2>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        {tCon('facturacion.borrador.paciente', { nombre: paciente.nombreCompleto })}
      </p>
      {borrador && !editable ? (
        <VistaBorrador borrador={borrador} programa={deps.proveedor()} />
      ) : (
        <EditorBorrador pacienteId={paciente.id} borrador={borrador} elegibles={elegibles} />
      )}
    </>
  );
}
