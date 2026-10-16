import { Ticket } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { iniciales } from '@/components/armazon/modulos';
import { Button } from '@/components/ui/button';
import {
  AvisoDeError,
  Cargando,
  EncabezadoDeModulo,
  EstadoVacio,
  FilaConAvatar,
  Pildora,
  Tarjeta,
} from '@/components/ui/piezas';
import { Seleccion } from '@/components/ui/seleccion';
import { formatearImporte } from '@/lib/dinero/importe';
import { formatearFechaSinZona } from '@/lib/fechas/relativo';
import { t, tCon } from '@/lib/i18n';

import { cargarPacientesParaCobro } from '../datos';
import { PaginacionPendientes } from '../paginacion-pendientes';
import { cargarBonos, cargarContextoBonos, cargarProfesionalesDeBonos, type ContextoBonos } from './datos';
import {
  TAMANO_PAGINA_BONOS,
  filtrarBonos,
  ordenarBonos,
  paginarBonos,
  pildoraDeEstado,
  textoExcedidas,
  textoQuedan,
} from './presentacion';
import { RegistrarBono } from './registrar-bono';

type ParametrosDeBusqueda = Promise<Record<string, string | string[] | undefined>>;
type Props = { searchParams: ParametrosDeBusqueda };

const ESTADOS = ['vigente', 'agotado', 'caducado'] as const;

const nombreDe = (fila: { nombre: string; apellidos: string }) => `${fila.nombre} ${fila.apellidos}`.trim();

/** El botón de registrar: necesita los pacientes (bajo RLS) y el «hoy» de la organización. */
async function AccionRegistrar({ searchParams }: Props) {
  const [{ hoy }, pacientes] = await Promise.all([cargarContextoBonos(searchParams), cargarPacientesParaCobro()]);
  // La isla se monta siempre, también sin lista de pacientes: su `Map` de claves de envío no puede
  // perderse con un fallo pasajero en un render posterior.
  return <RegistrarBono pacientes={pacientes.ok ? pacientes.pacientes : null} hoy={hoy} />;
}

/** `/facturacion/bonos` con los filtros y la página; la 1 va sin `pagina`. */
function hrefDePagina(contexto: ContextoBonos, pagina: number): string {
  const parametros = new URLSearchParams();
  if (contexto.estado) parametros.set('estado', contexto.estado);
  if (contexto.profesional) parametros.set('profesional', contexto.profesional);
  if (contexto.paciente) parametros.set('paciente', contexto.paciente);
  if (pagina > 1) parametros.set('pagina', String(pagina));
  const consulta = parametros.toString();
  return consulta ? `/facturacion/bonos?${consulta}` : '/facturacion/bonos';
}

/**
 * Los filtros y la lista. Los filtros son un formulario GET servido (sin JS): «Estado» para todos;
 * «Profesional» y «Paciente» solo para el administrador, y lo decide el servidor.
 */
async function ListaDeBonos({ searchParams }: Props) {
  const contexto = await cargarContextoBonos(searchParams);
  const resultado = await cargarBonos(contexto.hoy);
  if (!resultado.ok) return <AvisoDeError mensaje={t('bonos.errorBonos')} />;

  const esAdministrador = contexto.rol === 'administrador';

  let opcionesProfesional: { valor: string; texto: string }[] | null = null;
  let aviso: string | null = null;
  if (esAdministrador) {
    const ids = resultado.bonos.flatMap((b) => (b.profesionalId ? [b.profesionalId] : []));
    const profesionales = await cargarProfesionalesDeBonos(ids);
    if (profesionales.ok) {
      opcionesProfesional = profesionales.opciones
        .map((o) => ({ valor: o.id, texto: o.nombre }))
        .sort((a, b) => a.texto.localeCompare(b.texto, 'es'));
    } else {
      aviso = t('bonos.errorBonos');
    }
  }
  const opcionesPaciente = esAdministrador
    ? [...new Map(ordenarBonos(resultado.bonos).map((b) => [b.pacienteId, nombreDe(b)])).entries()].map(
        ([valor, texto]) => ({ valor, texto }),
      )
    : [];

  // Un filtro de la URL que no esté entre las opciones (el bono se reasignó, el directorio falló) no
  // se aplica: filtraría en silencio mientras el selector pinta «Todos» (T-027 H6).
  const profesional =
    contexto.profesional && opcionesProfesional?.some((o) => o.valor === contexto.profesional)
      ? contexto.profesional
      : null;
  const paciente =
    contexto.paciente && opcionesPaciente.some((o) => o.valor === contexto.paciente) ? contexto.paciente : null;
  const efectivo: ContextoBonos = { ...contexto, profesional, paciente };

  const filtrados = ordenarBonos(
    filtrarBonos(resultado.bonos, { estado: efectivo.estado, profesional, paciente }),
  );
  const { pagina, ultima, total, filas } = paginarBonos(filtrados, efectivo.pagina);

  return (
    <>
      <form method="get" action="/facturacion/bonos" aria-label={t('bonos.filtros.nombre')} className="flex flex-wrap items-end gap-3">
        <Seleccion
          id="filtro-estado"
          name="estado"
          etiqueta={t('bonos.filtros.estado')}
          textoVacio={t('bonos.filtros.todosLosEstados')}
          defaultValue={contexto.estado ?? ''}
          opciones={ESTADOS.map((e) => ({ valor: e, texto: t(`bonos.estado.${e}`) }))}
        />
        {esAdministrador && opcionesProfesional !== null && (
          <Seleccion
            id="filtro-profesional"
            name="profesional"
            etiqueta={t('bonos.filtros.profesional')}
            textoVacio={t('bonos.filtros.todosLosProfesionales')}
            defaultValue={efectivo.profesional ?? ''}
            opciones={opcionesProfesional}
          />
        )}
        {esAdministrador && (
          <Seleccion
            id="filtro-paciente"
            name="paciente"
            etiqueta={t('bonos.filtros.paciente')}
            textoVacio={t('bonos.filtros.todosLosPacientes')}
            defaultValue={efectivo.paciente ?? ''}
            opciones={opcionesPaciente}
          />
        )}
        <Button type="submit" variante="contorno">
          {t('bonos.filtros.filtrar')}
        </Button>
      </form>
      {aviso && <AvisoDeError mensaje={aviso} />}

      {filas.length === 0 ? (
        <Tarjeta className="p-5">
          <EstadoVacio
            icono={<Ticket className="size-5" aria-hidden="true" />}
            frase={t('bonos.vacio')}
            explicacion={t('bonos.vacioExplicacion')}
          />
        </Tarjeta>
      ) : (
        <Tarjeta className="p-5">
          <ul className="flex flex-col gap-4">
            {filas.map((bono) => {
              const pildora = pildoraDeEstado(bono.lectura.estado);
              const excedidas = textoExcedidas(bono.lectura.excedidas);
              return (
                <li key={bono.bonoId} className="flex flex-col gap-1">
                  <FilaConAvatar
                    iniciales={iniciales(nombreDe(bono))}
                    nombre={nombreDe(bono)}
                    derecha={<Pildora tono={pildora.tono}>{pildora.texto}</Pildora>}
                  />
                  <p className="ml-12 text-xs break-words text-muted-foreground">
                    {`${tCon('bonos.usadas', { usadas: bono.sesionesConsumidas, totales: bono.sesionesTotales })} · ${textoQuedan(bono.lectura.saldo)}`}
                  </p>
                  <p className="ml-12 text-xs break-words text-muted-foreground">
                    {`${tCon('bonos.importeDelBono', { importe: formatearImporte(bono.importe) })} · ${
                      bono.caducidad
                        ? tCon('bonos.caducaEl', { fecha: formatearFechaSinZona(bono.caducidad, contexto.zona) })
                        : t('bonos.sinCaducidad')
                    }`}
                  </p>
                  {excedidas && <p className="ml-12 text-xs font-medium text-accent-foreground">{excedidas}</p>}
                </li>
              );
            })}
          </ul>
          {ultima > 1 ? (
            <PaginacionPendientes
              pagina={pagina}
              nombre={t('bonos.paginacion.nombre')}
              rango={tCon('bonos.paginacion.rango', {
                desde: (pagina - 1) * TAMANO_PAGINA_BONOS + 1,
                hasta: (pagina - 1) * TAMANO_PAGINA_BONOS + filas.length,
                total,
              })}
              anterior={pagina > 1 ? hrefDePagina(efectivo, pagina - 1) : null}
              siguiente={pagina < ultima ? hrefDePagina(efectivo, pagina + 1) : null}
            />
          ) : null}
        </Tarjeta>
      )}
    </>
  );
}

/**
 * `/facturacion/bonos` (T-027 §1.6). **No es `async`**: la cabecera no depende de la petición. Lo que
 * espera `searchParams` o la sesión va detrás de un `<Suspense>`. Ninguna fila lleva botones: el bono se
 * consulta aquí y se vincula a las citas desde la agenda. No hay «facturar» (ADR-053).
 */
export default function PaginaBonos({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/facturacion"
        className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t('bonos.volver')}
      </Link>

      <EncabezadoDeModulo
        versalita={t('bonos.versalita')}
        titulo={t('bonos.titulo')}
        subtitulo={t('bonos.subtitulo')}
        accion={
          <Suspense fallback={null}>
            <AccionRegistrar searchParams={searchParams} />
          </Suspense>
        }
      />

      <Suspense fallback={<Cargando filas={4} />}>
        <ListaDeBonos searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
