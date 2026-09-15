'use client';

import { useId, useState, type ReactNode } from 'react';

import { PanelDePestana, Pestanas } from '@/components/ui/pestanas';
import { t } from '@/lib/i18n';

import { PanelHistoria } from './panel-historia';

/**
 * Las cinco pestañas de la ficha. Cliente, porque cambiar de pestaña es estado del
 * navegador; el contenido de las cuatro que no tienen candado llega **ya renderizado en
 * servidor** como `ReactNode`, así que esto no consulta nada.
 *
 * La pestaña activa **no va en la URL** (ADR-056). Con la pestaña en la dirección, una
 * recarga o un enlace compartido pintarían contenido clínico sin pasar por la acción que
 * registra el acceso; aquí recargar devuelve a Resumen, que es la historia cerrada.
 *
 * Solo se monta el panel activo. No es una optimización: montar `PanelHistoria` es lo que
 * dispara la apertura, así que tenerlo montado en segundo plano registraría accesos que
 * nadie pidió.
 */

type Props = {
  pacienteId: string;
  /** Falso para el técnico administrativo: la pestaña **no existe**, no sale en gris. */
  mostrarHistoria: boolean;
  resumen: ReactNode;
  datos: ReactNode;
  documentos: ReactNode;
  facturacion: ReactNode;
};

type Seccion = 'resumen' | 'datos' | 'historia' | 'documentos' | 'facturacion';

export function FichaCliente({
  pacienteId,
  mostrarHistoria,
  resumen,
  datos,
  documentos,
  facturacion,
}: Props) {
  const prefijo = useId();
  const [activa, setActiva] = useState<Seccion>('resumen');

  const pestanas = [
    { id: 'resumen', etiqueta: t('ficha.resumen') },
    { id: 'datos', etiqueta: t('ficha.fichaDelPaciente') },
    ...(mostrarHistoria ? [{ id: 'historia', etiqueta: t('ficha.historiaClinica') }] : []),
    { id: 'documentos', etiqueta: t('ficha.documentos') },
    { id: 'facturacion', etiqueta: t('ficha.facturacion') },
  ];

  return (
    <div className="mt-6">
      <Pestanas
        pestanas={pestanas}
        activa={activa}
        alCambiar={(id) => setActiva(id as Seccion)}
        etiqueta={t('ficha.secciones')}
        prefijo={prefijo}
      />

      <PanelDePestana id={activa} prefijo={prefijo}>
        {activa === 'resumen' && resumen}
        {activa === 'datos' && datos}
        {/* La Historia clínica trae dentro su barra de sub-pestañas y su candado. */}
        {activa === 'historia' && <PanelHistoria pacienteId={pacienteId} />}
        {activa === 'documentos' && documentos}
        {activa === 'facturacion' && facturacion}
      </PanelDePestana>
    </div>
  );
}
