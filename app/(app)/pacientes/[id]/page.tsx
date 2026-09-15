import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Cargando, Pildora } from '@/components/ui/piezas';
import { t, tCon } from '@/lib/i18n';

import { cargarIndicadorDeRiesgo, cargarPaciente, cargarRol } from './datos';
import { FichaCliente } from './ficha-cliente';
import { PanelDatos } from './panel-datos';
import { PanelDocumentos } from './panel-documentos';
import { PanelResumen } from './panel-resumen';
import { edadEnAnios, fechaLarga, valoracionEsAntigua } from './presentacion';

/**
 * La ficha de un paciente: `/pacientes/<uuid>`.
 *
 * El identificador es **UUID y solo UUID** (choque 8): ni nombre, ni apellidos, ni DNI en la
 * dirección, ni siquiera como parámetro de búsqueda. Lo que llega por la URL se valida
 * contra `pacientes` antes de pintar nada, y un id que no sea visible para quien mira es un
 * 404 —no un «no tienes permiso», que ya diría que ese paciente existe.
 *
 * **Nada de esto entra en `use cache`** (ADR-043), ni siquiera `use cache: private`: sería
 * servirle un paciente a quien no le toca.
 *
 * Tres campos que el ticket pide en la cabecera **no se pintan**, y el motivo de cada uno es
 * distinto (está razonado en `tickets/T-013/diseno.md` §1):
 *   · teléfono y teléfono de emergencia — no existe columna de teléfono del paciente en
 *     ninguna tabla; la única que hay es la del representante legal;
 *   · DNI y residencia — existen en `pacientes_identificacion` pero **cifrados**, y no hay
 *     hoy camino de descifrado en la aplicación;
 *   · motivo de consulta y nivel de riesgo — viven detrás de `historia_desbloqueada()`, así
 *     que no caben en una cabecera fija: aparecen dentro de Historial clínico, donde
 *     abrirlos registra el acceso. El técnico, que no tiene candado, ve en su lugar el
 *     indicador binario de `pacientes_indicador_riesgo`, que la arquitectura construyó
 *     exactamente para eso.
 */

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {etiqueta}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

async function Cabecera({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const paciente = await cargarPaciente(id);
  if (!paciente) notFound();

  const rol = await cargarRol();
  const edad = edadEnAnios(paciente.fechaNacimiento);

  // Solo el técnico administrativo: la vista `pacientes_indicador_riesgo` filtra por rol en
  // la propia base, así que para los demás vuelve vacía. Pedirla aquí y no dentro del `if`
  // sería pedir una consulta que se sabe inútil.
  const indicador =
    rol === 'tecnico_administrativo' ? await cargarIndicadorDeRiesgo(paciente.id) : null;

  return (
    <header className="border-border bg-card rounded-xl border p-5 shadow-sm">
      <h2 className="font-serif text-3xl font-semibold tracking-tight">
        {paciente.nombre} {paciente.apellidos}
      </h2>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Dato etiqueta={t('ficha.centro')}>{paciente.centro ?? t('ficha.sinCentro')}</Dato>
        <Dato etiqueta={t('ficha.alta')}>{fechaLarga(paciente.creadoEn)}</Dato>
        <Dato etiqueta={t('ficha.edad')}>
          {edad === null ? t('ficha.sinFechaDeNacimiento') : tCon('ficha.anios', { n: edad })}
        </Dato>
      </dl>

      {/* Bloque propio, y **solo si hay algo legible que poner**: un bloque vacío con el
          rótulo puesto sugiere que el dato existe y no se enseña (choque 5). */}
      {indicador && (
        <dl className="border-border mt-4 border-t pt-4">
          <Dato etiqueta={t('ficha.indicadorDeRiesgo')}>
            <span className="flex flex-wrap items-center gap-2">
              <Pildora tono={indicador.indicador ? 'warning' : 'success'}>
                {indicador.indicador ? t('ficha.conIndicador') : t('ficha.sinIndicador')}
              </Pildora>
              <span className="text-muted-foreground text-xs">
                {valoracionEsAntigua(indicador.valoradoEn)
                  ? tCon('ficha.valoracionAntigua', { fecha: fechaLarga(indicador.valoradoEn) })
                  : tCon('ficha.valoradoEl', { fecha: fechaLarga(indicador.valoradoEn) })}
              </span>
            </span>
          </Dato>
        </dl>
      )}
    </header>
  );
}

async function Cuerpo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const paciente = await cargarPaciente(id);
  if (!paciente) notFound();

  const rol = await cargarRol();

  return (
    <FichaCliente
      pacienteId={paciente.id}
      // El técnico administrativo no ve la pestaña **en absoluto**: ni en gris ni
      // deshabilitada. Una pestaña deshabilitada dice que hay algo detrás.
      mostrarHistoria={rol === 'profesional_sanitario' || rol === 'administrador'}
      resumen={
        <Suspense fallback={<Cargando filas={4} />}>
          <PanelResumen pacienteId={paciente.id} />
        </Suspense>
      }
      datos={
        <Suspense fallback={<Cargando filas={4} />}>
          <PanelDatos pacienteId={paciente.id} />
        </Suspense>
      }
      documentos={
        <Suspense fallback={<Cargando filas={4} />}>
          <PanelDocumentos pacienteId={paciente.id} />
        </Suspense>
      }
      facturacion={<Facturacion />}
    />
  );
}

/** Vacía y dicho con todas las letras, que es lo que pide el ticket: ni cifras falsas ni un esqueleto eterno. */
function Facturacion() {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
      <p className="font-serif text-lg font-semibold">{t('ficha.facturacionVacia')}</p>
      <p className="text-muted-foreground max-w-sm text-sm">
        {t('ficha.facturacionVaciaExplicacion')}
      </p>
    </div>
  );
}

/**
 * **No es `async`**: el enlace de vuelta no depende de ningún dato y se prerenderiza. Lo que
 * depende de la petición son dos bloques —la cabecera y el cuerpo—, cada uno detrás de su
 * propio `<Suspense>`, para que el esqueleto de uno no deje el otro en blanco.
 */
export default function PaginaFichaDePaciente({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <Link
        href="/pacientes"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mb-4 inline-flex min-h-11 items-center gap-1 text-sm outline-none focus-visible:ring-2"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t('ficha.volverALaLista')}
      </Link>

      <Suspense
        fallback={
          <div className="border-border bg-card rounded-xl border p-5">
            <Cargando filas={3} />
          </div>
        }
      >
        <Cabecera params={params} />
      </Suspense>

      <Suspense
        fallback={
          <div className="mt-6">
            <Cargando filas={5} />
          </div>
        }
      >
        <Cuerpo params={params} />
      </Suspense>
    </>
  );
}
