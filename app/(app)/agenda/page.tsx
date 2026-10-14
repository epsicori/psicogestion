import Link from 'next/link';
import { Suspense } from 'react';

import { AvisoDeError, Tarjeta } from '@/components/ui/piezas';
import { leerCitasRango } from '@/lib/citas/agenda';
import { leerDensidadAnual, listarProfesionalesDelAnio } from '@/lib/citas/densidad';
import { listarPropuestasPendientes } from '@/lib/citas/propuestas';
import { t } from '@/lib/i18n';

import { rangoDeVista } from './bloques';
import { Calendario } from './calendario';
import { CalendarioAnio } from './calendario-anio';
import { Cuadro } from './cuadro';
import { cargarContexto } from './datos';
import { Documentacion } from './documentacion';
import { EsqueletoAnio, EsqueletoCalendario, EsqueletoCuadro, EsqueletoLista } from './esqueletos';
import { MarcoBloque } from './marco';
import { leerParametros, type ParametrosAgenda, type VistaConCitas } from './parametros';
import { PorConfirmar } from './por-confirmar';
import { Proximas } from './proximas';
import { construirVista } from './vista';
import { construirVistaAnio } from './vista-anio';
import { ZonaPorConfirmar } from './zona-por-confirmar';

type ParametrosDeBusqueda = Promise<Record<string, string | string[] | undefined>>;

/**
 * El calendario, con la fecha y el filtro elegidos en la URL (T-014 §1.6.1). Sesión, rol, centros
 * y reloj salen de `cargarContexto`, que memoiza por petición: cada bloque lo pide y se lee una
 * vez. Nada se guarda entre peticiones (ADR-043): es lo que ve quien mira, no lo que ve todo el mundo.
 */
async function BloqueCalendario({ parametros }: { parametros: ParametrosAgenda & { vista: VistaConCitas } }) {
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
    rol,
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

/**
 * La vista anual (T-047): dos lecturas agregadas en la base —los recuentos por día y los
 * profesionales con citas del año— y ninguna fila de cita. Misma regla que el bloque anterior:
 * nada se guarda entre peticiones (ADR-043).
 */
async function BloqueAnio({ parametros }: { parametros: ParametrosAgenda }) {
  const contexto = await cargarContexto(parametros.centro);
  if (!contexto.ok) return <AvisoDeError mensaje={contexto.mensaje} />;
  const { sesion, rol, centros, centro, zona, hoy } = contexto;

  const fecha = parametros.fecha ?? hoy;
  const { desde, hasta } = rangoDeVista('anio', fecha, zona);

  const [densidad, lista] = await Promise.all([
    leerDensidadAnual(sesion, { desde, hasta, zona, centroId: centro, profesionalId: parametros.profesional }),
    listarProfesionalesDelAnio(sesion, { desde, hasta, zona, centroId: centro }),
  ]);
  if (!densidad.ok) return <AvisoDeError mensaje={densidad.mensaje} />;

  const vista = construirVistaAnio({
    fecha,
    zona,
    hoy,
    dias: densidad.dias,
    // Sin la lista el año sigue: solo se queda sin el filtro de profesional.
    profesionales: lista.ok ? lista.profesionales : [],
  });

  return (
    <CalendarioAnio
      key={`anio-${vista.fechaFoco}`}
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
  const { vista } = parametros;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <Tarjeta className="p-4">
          {vista === 'anio' ? (
            <Suspense fallback={<EsqueletoAnio />}>
              <BloqueAnio parametros={parametros} />
            </Suspense>
          ) : (
            <Suspense fallback={<EsqueletoCalendario />}>
              <BloqueCalendario parametros={{ ...parametros, vista }} />
            </Suspense>
          )}
        </Tarjeta>
        <Suspense fallback={<EsqueletoCuadro />}>
          <Cuadro centroParametro={parametros.centro} />
        </Suspense>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <MarcoBloque id="agenda-proximas" titulo={t('agenda.proximas.titulo')}>
          <Suspense fallback={<EsqueletoLista />}>
            <Proximas centroParametro={parametros.centro} />
          </Suspense>
        </MarcoBloque>
        <ZonaPorConfirmar>
          <Suspense fallback={null}>
            <PorConfirmar centroParametro={parametros.centro} />
          </Suspense>
        </ZonaPorConfirmar>
        <Suspense
          fallback={
            <MarcoBloque id="agenda-documentacion" titulo={t('agenda.documentacion.titulo')}>
              <EsqueletoLista />
            </MarcoBloque>
          }
        >
          <Documentacion centroParametro={parametros.centro} />
        </Suspense>
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
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-primary mb-2 text-xs font-semibold tracking-[0.18em] uppercase">{t('agenda.versalita')}</p>
          <h2 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">{t('agenda.titulo')}</h2>
        </div>
        <Link
          href="/agenda/nueva"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/50 inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold shadow-sm transition outline-none focus-visible:ring-2"
        >
          {t('agenda.alta.abrir')}
        </Link>
      </div>

      <Suspense fallback={<EsqueletoCalendario />}>
        <Cuerpo searchParams={searchParams} />
      </Suspense>
    </>
  );
}
