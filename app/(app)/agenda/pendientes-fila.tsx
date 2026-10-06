'use client';

import { ChevronDown, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Pildora } from '@/components/ui/piezas';
import { cn } from '@/lib/utils';

import type { GrupoPresentado, PendientePresentado } from './pendientes';
import { idEnlacePaciente, idListaPendientes, idResumen, type Prefijo } from './pendientes-ids';
import { ResolverAlerta } from './resolver-alerta';

const ENLACE =
  'focus-visible:ring-ring/50 inline-flex min-h-11 items-center font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2';

function ItemPendiente({ pendiente, pacienteId }: { pendiente: PendientePresentado; pacienteId: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {/* El nombre accesible empieza por el texto visible (WCAG 2.5.3). */}
      <Link href={pendiente.destino} aria-label={pendiente.nombreEnlace} className={ENLACE}>
        {pendiente.etiquetaTipo}
      </Link>
      <span className="text-muted-foreground">{pendiente.textoDesde}</span>
      {pendiente.pildora && <Pildora tono="warning">{pendiente.pildora}</Pildora>}
      {pendiente.resoluble && (
        <ResolverAlerta alertaId={pendiente.id} pacienteId={pacienteId} etiquetaTipo={pendiente.etiquetaTipo} />
      )}
    </li>
  );
}

/** El recuento. La urgencia máxima no depende solo del color: la más alta lleva icono y borde. */
function Insignia({ grupo }: { grupo: GrupoPresentado }) {
  const muyAtrasada = grupo.urgencia === 'muy-atrasada';
  return (
    <span
      data-urgencia={grupo.urgencia ?? undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 text-xs',
        muyAtrasada ? 'border-2 border-foreground font-semibold text-foreground' : 'text-muted-foreground',
      )}
    >
      {muyAtrasada && <TriangleAlert aria-hidden="true" className="size-3.5" />}
      {grupo.insignia}
    </span>
  );
}

/**
 * Un paciente de la bandeja (T-048). Quien la pinta la mete en un `<li key={pacienteId}>`: la
 * clave es lo que hace que el estado abierto sobreviva a la revalidación. Ese estado es del
 * componente y de nadie más (D9): ni almacenamiento, ni cookies, ni la URL.
 *
 * Con un solo pendiente, o en la página completa, no hay desplegable: el recuento es texto y los
 * pendientes salen debajo.
 */
export function FilaPaciente({
  grupo,
  prefijo,
  modo,
}: {
  grupo: GrupoPresentado;
  prefijo: Prefijo;
  modo: 'desplegable' | 'completo';
}) {
  const [abierta, setAbierta] = useState(false);
  const desplegable = modo === 'desplegable' && grupo.recuento >= 2;
  const idLista = idListaPendientes(prefijo, grupo.pacienteId);
  const idTextoResumen = idResumen(prefijo, grupo.pacienteId);

  return (
    <div className="flex flex-col gap-1 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link id={idEnlacePaciente(prefijo, grupo.pacienteId)} href={grupo.hrefPaciente} className={ENLACE}>
          {grupo.nombre}
        </Link>
        {desplegable ? (
          <Button
            variante="fantasma"
            tamano="sm"
            aria-expanded={abierta}
            aria-controls={idLista}
            aria-describedby={idTextoResumen}
            aria-label={grupo.textoAccesible}
            onClick={() => setAbierta((v) => !v)}
          >
            <Insignia grupo={grupo} />
            <ChevronDown aria-hidden="true" className={cn('size-4', abierta && 'rotate-180')} />
          </Button>
        ) : (
          <Insignia grupo={grupo} />
        )}
        {grupo.textoUrgencia && <Pildora tono="warning">{grupo.textoUrgencia}</Pildora>}
      </div>
      {desplegable && grupo.resumen && (
        <p id={idTextoResumen} className="text-muted-foreground text-xs">
          {grupo.resumen}
        </p>
      )}
      {/* Siempre en el DOM, con `hidden`: `aria-controls` apunta a algo que existe. */}
      <ul id={idLista} hidden={desplegable && !abierta} className="flex flex-col pl-2">
        {grupo.pendientes.map((p) => (
          <ItemPendiente key={p.id} pendiente={p} pacienteId={grupo.pacienteId} />
        ))}
        {grupo.verTodos && (
          <li>
            <Link href={grupo.verTodos.href} className={ENLACE}>
              {grupo.verTodos.texto}
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
