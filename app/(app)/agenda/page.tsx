import { Suspense } from 'react';

import { AvisoDeError, Tarjeta } from '@/components/ui/piezas';
import { leerCitasRango } from '@/lib/citas/agenda';
import { listarPropuestasPendientes } from '@/lib/citas/propuestas';
import { t } from '@/lib/i18n';

import { rangoDeVista } from './bloques';
import { Calendario } from './calendario';
import { Cuadro } from './cuadro';
import { cargarContexto } from './datos';
import { Documentacion } from './documentacion';
import { EsqueletoCalendario, EsqueletoCuadro, EsqueletoLista } from './esqueletos';
import { MarcoBloque } from './marco';
import { leerParametros, type ParametrosAgenda } from './parametros';
import { PorConfirmar } from './por-confirmar';
import { Proximas } from './proximas';
import { construirVista } from './vista';

type ParametrosDeBusqueda = Promise<Record<string, string | string[] | undefined>>;

/**
 * El calendario, con la fecha y el filtro elegidos en la URL (T-014 §1.6.1). Sesión, rol, centros
 * y reloj salen de `cargarContexto`, que memoiza por petición: cada bloque lo pide y se lee una
 * vez. Nada se guarda entre peticiones (ADR-043): es lo que ve quien mira, no lo que ve todo el mundo.
 */
async function BloqueCalendario({ parametros }: { parametros: ParametrosAgenda }) {
  const contexto = await cargarContexto(parametros.centro);
  if (!contexto.ok) return <AvisoDeError mensaje={contexto.mensaje} />;
  const { sesion, rol, centros, centro, zona, hoy, ahora } = contexto;

  const fecha = parametros.fecha ?? hoy;
  const { desde, hasta } = rangoDeVista(parametros.vista, fecha, zona);

  const [citas, propuestas] = await Promise.all([leerCitasRango(sesion, desde, hasta), listarPropuestasPendientes(sesion)]);
  if (!citas.ok) return <AvisoDeError mensaje={citas.mensaje} />;

  const vista = construirVista({
    filas: centro === null ? citas.filas : citas.filas.filter((f) => f.centroId === centro),
    // Sin propuestas legibles el calendario sigue: solo dejan de marcarse las citas afectadas.
    propuestas: propuestas.ok ? propuestas.propuestas : [],
    vista: parametros.vista,
    fecha,
    zona,
    hoy,
    ahora,
    usuarioId: sesion.usuario.id,
    profesionalFiltrado: parametros.profesional,
  });

  return (
    <Calendario
      key={`${vista.vista}-${vista.fechaFoco}`}
      vista={vista}
      parametros={{ centro: parametros.centro, profesional: parametros.profesional }}
      centros={centros}
      centroElegido={centro ?? 'todos'}
      rol={rol}
    />
  );
}

async function Cuerpo({ searchParams }: { searchParams: ParametrosDeBusqueda }) {
  const parametros = leerParametros(await searchParams);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <Tarjeta className="p-4">
          <Suspense fallback={<EsqueletoCalendario />}>
            <BloqueCalendario parametros={parametros} />
          </Suspense>
        </Tarjeta>
        <Suspense fallback={<EsqueletoCuadro />}>
          <Cuadro centroParametro={parametros.centro} />
        </Suspense>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Suspense fallback={null}>
          <PorConfirmar centroParametro={parametros.centro} />
        </Suspense>
        <MarcoBloque id="agenda-proximas" titulo={t('agenda.proximas.titulo')}>
          <Suspense fallback={<EsqueletoLista />}>
            <Proximas centroParametro={parametros.centro} />
          </Suspense>
        </MarcoBloque>
        <MarcoBloque id="agenda-documentacion" titulo={t('agenda.documentacion.titulo')}>
          <Suspense fallback={<EsqueletoLista />}>
            <Documentacion centroParametro={parametros.centro} />
          </Suspense>
        </MarcoBloque>
      </div>
    </div>
  );
}

/**
 * **No es `async`**: la cabecera no depende de la petición y se prerenderiza. Lo que espera
 * `searchParams` va detrás de un `<Suspense>`; cada bloque, detrás del suyo.
 */
export default function PaginaAgenda({ searchParams }: { searchParams: ParametrosDeBusqueda }) {
  return (
    <>
      <div className="mb-7">
        <p className="text-primary mb-2 text-xs font-semibold tracking-[0.18em] uppercase">{t('agenda.versalita')}</p>
        <h2 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">{t('agenda.titulo')}</h2>
      </div>

      <Suspense fallback={<EsqueletoCalendario />}>
        <Cuerpo searchParams={searchParams} />
      </Suspense>
    </>
  );
}
