import { Suspense } from 'react';

import { EncabezadoDeModulo } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';

import {
  BloqueCobros,
  BloqueMetrica,
  BloquePendientes,
  EsqueletoLista,
  EsqueletoMetrica,
  MarcoFacturacion,
} from './bloques';
import { cargarContexto, cargarOpcionesProfesional, cargarPacientesParaCobro } from './datos';
import { RegistrarCobro } from './registrar-cobro';
import { SelectorProfesional } from './selector-profesional';

type ParametrosDeBusqueda = Promise<Record<string, string | string[] | undefined>>;

/** El botón de registrar cobro: necesita los pacientes (bajo RLS) y el «hoy» de la organización. */
async function AccionRegistrar({ searchParams }: { searchParams: ParametrosDeBusqueda }) {
  const [{ hoy }, pacientes] = await Promise.all([cargarContexto(searchParams), cargarPacientesParaCobro()]);
  return <RegistrarCobro pacientes={pacientes} hoy={hoy} />;
}

/**
 * El selector de profesional **solo existe** para el administrador, y lo decide el servidor (D11):
 * para el profesional y el técnico no se monta ni se leen las opciones.
 */
async function SelectorSiAdministrador({ searchParams }: { searchParams: ParametrosDeBusqueda }) {
  const { rol, profesionalFiltrado } = await cargarContexto(searchParams);
  if (rol !== 'administrador') return null;
  const opciones = await cargarOpcionesProfesional();
  return <SelectorProfesional opciones={opciones} elegido={profesionalFiltrado} />;
}

/**
 * `/facturacion` (T-023 §1.4). **No es `async`**: la cabecera no depende de la petición. Lo que
 * espera `searchParams` o la sesión va detrás de un `<Suspense>`; cada bloque, detrás del suyo.
 */
export default function PaginaFacturacion({ searchParams }: { searchParams: ParametrosDeBusqueda }) {
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoDeModulo
        versalita={t('cobros.versalita')}
        titulo={t('cobros.titulo')}
        subtitulo={t('cobros.subtitulo')}
        accion={
          <Suspense fallback={null}>
            <AccionRegistrar searchParams={searchParams} />
          </Suspense>
        }
      />

      <Suspense fallback={null}>
        <SelectorSiAdministrador searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<EsqueletoMetrica />}>
        <BloqueMetrica searchParams={searchParams} />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-2">
        <MarcoFacturacion id="facturacion-pendientes" titulo={t('cobros.pendientes')}>
          <Suspense fallback={<EsqueletoLista />}>
            <BloquePendientes searchParams={searchParams} />
          </Suspense>
        </MarcoFacturacion>
        <MarcoFacturacion id="facturacion-cobros" titulo={t('cobros.recientes')}>
          <Suspense fallback={<EsqueletoLista />}>
            <BloqueCobros searchParams={searchParams} />
          </Suspense>
        </MarcoFacturacion>
      </div>
    </div>
  );
}
