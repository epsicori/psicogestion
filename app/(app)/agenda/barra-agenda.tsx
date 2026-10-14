'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { RolUsuario } from '@/components/armazon/modulos';
import { Seleccion } from '@/components/ui/seleccion';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import type { Vista } from './parametros';

/** El enlace con forma de botón de la barra del calendario: semana, mes y año lo comparten. */
export const ENLACE_BARRA =
  'border-border bg-background hover:bg-muted focus-visible:ring-ring/50 inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-2';

const VISTAS: { vista: Vista; texto: () => string }[] = [
  { vista: 'semana', texto: () => t('agenda.barra.semana') },
  { vista: 'mes', texto: () => t('agenda.barra.mes') },
  { vista: 'anio', texto: () => t('agenda.barra.anio') },
];

/** El conmutador de vista: tres enlaces, el actual con `aria-current="page"`. */
export function SelectorVista({ actual, hrefDe }: { actual: Vista; hrefDe: (vista: Vista) => string }) {
  return (
    <div role="group" aria-label={t('agenda.barra.vista')} className="ml-auto flex gap-1">
      {VISTAS.map(({ vista, texto }) => {
        const activa = vista === actual;
        return (
          <Link
            key={vista}
            href={hrefDe(vista)}
            aria-current={activa ? 'page' : undefined}
            className={cn(ENLACE_BARRA, activa && 'bg-primary text-primary-foreground hover:bg-primary/90 border-primary')}
          >
            {texto()}
          </Link>
        );
      })}
    </div>
  );
}

type PropsFiltros = {
  centros: { id: string; nombre: string }[];
  /** `'todos'` o el uuid del centro que filtra: lo que dice el selector. */
  centroElegido: string;
  rol: RolUsuario | null;
  profesionales: { id: string; nombre: string }[];
  profesionalElegido: string | null;
  /** El enlace de la agenda con esos filtros cambiados y lo demás como está. */
  hrefCon: (cambios: { centro?: string | null; profesional?: string | null }) => string;
};

/** Los dos filtros de la agenda: centro (con dos o más) y profesional (no para un sanitario). */
export function FiltrosAgenda({
  centros,
  centroElegido,
  rol,
  profesionales,
  profesionalElegido,
  hrefCon,
}: PropsFiltros) {
  const router = useRouter();
  const mostrarCentro = centros.length >= 2;
  const mostrarProfesional = rol !== 'profesional_sanitario' && profesionales.length >= 2;
  if (!mostrarCentro && !mostrarProfesional) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {mostrarCentro && (
        <Seleccion
          id="filtro-centro"
          etiqueta={t('agenda.barra.centro')}
          textoVacio={t('agenda.barra.todosLosCentros')}
          opciones={centros.map((c) => ({ valor: c.id, texto: c.nombre }))}
          value={centroElegido === 'todos' ? '' : centroElegido}
          onChange={(evento) =>
            router.replace(hrefCon({ centro: evento.target.value || 'todos' }), { scroll: false })
          }
        />
      )}
      {mostrarProfesional && (
        <Seleccion
          id="filtro-profesional"
          etiqueta={t('agenda.barra.profesional')}
          textoVacio={t('agenda.barra.todosLosProfesionales')}
          opciones={profesionales.map((p) => ({ valor: p.id, texto: p.nombre }))}
          value={profesionalElegido ?? ''}
          onChange={(evento) =>
            router.replace(hrefCon({ profesional: evento.target.value || null }), { scroll: false })
          }
        />
      )}
    </div>
  );
}
