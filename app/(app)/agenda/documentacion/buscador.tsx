'use client';

import { unstable_rethrow } from 'next/navigation';
import { startTransition, useActionState, useRef, useState, type ReactNode } from 'react';

import { AvisoDeError } from '@/components/ui/piezas';
import { Button } from '@/components/ui/button';
import { t, tCon } from '@/lib/i18n';

import type { Filtros } from '../pendientes';
import { FilaPaciente } from '../pendientes-fila';
import { ProveedorResolucion, useDescartarResolucion } from '../resolver-alerta';
import { buscarPendientes, type EstadoBusqueda } from './acciones';
import { esquemaTermino, ID_TITULO } from './parametros';

const ID_CAMPO = 'busqueda-termino';
const ID_AYUDA = 'busqueda-ayuda';
const ID_ERROR = 'busqueda-error';

/**
 * El buscador de la página (T-048, D10). El término vive en un campo y en el estado de este
 * componente y en ningún otro sitio: ni la URL, ni el historial, ni almacenamiento, ni cookies.
 * Se envía por una Server Action (POST), de modo que tampoco queda en un registro de peticiones
 * con la dirección.
 *
 * Tras resolver una alerta entre los resultados, se repite la última búsqueda (`relanzar`) para
 * que el resultado refleje la base; el foco lo decide el proveedor cuando la alerta deja de
 * estar pintada.
 */
export function Buscador(props: {
  tipo: Filtros['tipo'];
  nivel: Filtros['nivel'];
  pagina: number;
  children: ReactNode;
}) {
  // Cambiar de filtro o de página remonta el buscador: el término, los resultados y el último envío
  // (que `relanzar` repetiría con el filtro viejo) se descartan, como dice la ayuda del campo.
  return <BuscadorInterno key={`${props.tipo ?? ''}|${props.nivel ?? ''}|${props.pagina}`} {...props} />;
}

function BuscadorInterno({
  tipo,
  nivel,
  children,
}: {
  tipo: Filtros['tipo'];
  nivel: Filtros['nivel'];
  pagina: number;
  children: ReactNode;
}) {
  const [estado, accion, buscando] = useActionState<EstadoBusqueda, FormData>(
    async (previo, datos) => {
      try {
        return await buscarPendientes(previo, datos);
      } catch (error) {
        unstable_rethrow(error);
        // El error no se registra: podría llevar el cuerpo de la petición, y con él el término.
        console.error('Buscador: la acción ha fallado');
        return { fase: 'fallo' };
      }
    },
    { fase: 'inicial' },
  );
  const descartar = useDescartarResolucion();
  const [vista, setVista] = useState<'lista' | 'busqueda'>('lista');
  const [errorLocal, setErrorLocal] = useState(false);
  const [termino, setTermino] = useState('');
  const ultimoEnvio = useRef<FormData | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  const hayError = errorLocal || estado.fase === 'invalida';
  const hayFallo = vista === 'busqueda' && estado.fase === 'fallo';

  function enviar(datos: FormData) {
    if (!esquemaTermino.safeParse(datos.get('termino')).success) {
      setErrorLocal(true);
      return;
    }
    // Una búsqueda nueva es una decisión del usuario: la resolución en vuelo ya no manda el foco.
    descartar();
    setErrorLocal(false);
    ultimoEnvio.current = datos;
    setVista('busqueda');
    accion(datos);
  }

  const relanzar = () => {
    const datos = ultimoEnvio.current;
    if (datos) startTransition(() => accion(datos));
  };

  // `relanzar` no descarta: es la continuación de la resolución, no una decisión nueva.
  function limpiar() {
    // Antes de enfocar el campo: la lista que vuelve tiene otro prefijo y la resolución en vuelo
    // le llevaría el foco al título, robándoselo al campo.
    descartar();
    setVista('lista');
    setTermino('');
    setErrorLocal(false);
    campo.current?.focus();
  }

  const anuncio =
    vista === 'busqueda' && estado.fase === 'resultados'
      ? estado.coincidencias === 0
        ? t('agenda.documentacion.buscador.ninguna')
        : estado.coincidencias === 1
          ? t('agenda.documentacion.buscador.una')
          : tCon('agenda.documentacion.buscador.varias', { n: estado.coincidencias })
      : '';

  return (
    <div className="flex flex-col gap-4">
      <form action={enviar} className="flex flex-col gap-2">
        <label htmlFor={ID_CAMPO} className="text-sm font-medium">
          {t('agenda.documentacion.buscador.etiqueta')}
        </label>
        <div className="flex flex-wrap items-start gap-2">
          <input
            ref={campo}
            id={ID_CAMPO}
            type="search"
            name="termino"
            autoComplete="off"
            value={termino}
            onChange={(e) => setTermino(e.target.value)}
            aria-describedby={hayError ? `${ID_AYUDA} ${ID_ERROR}` : ID_AYUDA}
            aria-invalid={hayError}
            className="border-input bg-background focus-visible:ring-ring/50 min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
          />
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
          {nivel && <input type="hidden" name="nivel" value={nivel} />}
          <Button
            type="submit"
            aria-disabled={buscando}
            onClick={(e) => {
              // `aria-disabled` no impide el clic: un segundo clic no envía dos veces.
              if (buscando) e.preventDefault();
            }}
          >
            {t('agenda.documentacion.buscador.boton')}
          </Button>
        </div>
        <p id={ID_AYUDA} className="text-muted-foreground text-xs">
          {t('agenda.documentacion.buscador.ayuda')}
        </p>
        {hayError && (
          <p id={ID_ERROR} className="text-destructive text-xs">
            {t('agenda.documentacion.buscador.invalida')}
          </p>
        )}
      </form>

      {/* Siempre montado: un live region que nace con el contenido no se anuncia. */}
      <p role="status" aria-live="polite" aria-atomic="true" data-estado-busqueda className="sr-only">
        {anuncio}
      </p>

      {vista === 'busqueda' && estado.fase === 'resultados' ? (
        <div className="flex flex-col gap-3">
          <Button variante="contorno" tamano="sm" className="self-start" onClick={limpiar}>
            {t('agenda.documentacion.buscador.limpiar')}
          </Button>
          {estado.grupos.length < estado.coincidencias && (
            <p className="text-muted-foreground text-xs">
              {tCon('agenda.documentacion.buscador.masDe20', { n: estado.coincidencias })}
            </p>
          )}
          {estado.recortada && (
            <p className="text-muted-foreground text-xs">
              {tCon('agenda.documentacion.recorte', { leidos: estado.leidos, total: estado.total })}
            </p>
          )}
          <ProveedorResolucion
            prefijo="busqueda"
            encabezadoId={ID_TITULO}
            pacientes={estado.grupos.map((g) => ({
              id: g.pacienteId,
              alertas: g.pendientes.map((p) => p.id),
              anuncio: g.anuncio,
            }))}
            alAcertar={relanzar}
          >
            <ul className="divide-border flex flex-col divide-y">
              {estado.grupos.map((g) => (
                <li key={g.pacienteId}>
                  <FilaPaciente grupo={g} prefijo="busqueda" modo="desplegable" />
                </li>
              ))}
            </ul>
          </ProveedorResolucion>
        </div>
      ) : (
        <>
          {hayFallo ? (
            <div className="flex flex-col gap-3">
              <AvisoDeError mensaje={t('agenda.documentacion.buscador.error')} />
              <Button variante="contorno" tamano="sm" className="self-start" onClick={limpiar}>
                {t('agenda.documentacion.buscador.limpiar')}
              </Button>
            </div>
          ) : (
            children
          )}
        </>
      )}
    </div>
  );
}
