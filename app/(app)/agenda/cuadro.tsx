import { AvisoDeError } from '@/components/ui/piezas';
import { leerCitasRango } from '@/lib/citas/agenda';
import { t, tCon } from '@/lib/i18n';

import { filtrarPorCentro, metricasDelMes, puedeVerCuadro, rangoDelMes, type MetricasDelMes } from './bloques';
import { cargarContexto, cargarRol } from './datos';
import { MarcoBloque } from './marco';
import { TarjetaMetrica } from './tarjeta-metrica';

function porcentaje(valor: number | null): string {
  return valor === null ? t('agenda.cuadro.sinDatos') : tCon('agenda.cuadro.porcentaje', { n: valor });
}

/**
 * Asistencia y ausencia sin aviso del mes en curso (§1.6.1). Solo al administrador y al
 * profesional sanitario, en lista blanca: a cualquier otro rol, o sin rol, **ni se consulta**
 * ni se pinta. Por eso el bloque trae su propio marco: sin cuadro no queda una tarjeta vacía.
 */
export async function Cuadro({ centroParametro }: { centroParametro: string | null }) {
  // El rol va antes que el contexto (revisión TS H7): si el contexto falla, al técnico no se
  // le pinta ni el marco del cuadro con un aviso.
  if (!puedeVerCuadro(await cargarRol())) return null;
  const contexto = await cargarContexto(centroParametro);
  if (!contexto.ok) {
    return (
      <MarcoBloque id="agenda-cuadro" titulo={t('agenda.cuadro.titulo')}>
        <AvisoDeError mensaje={contexto.mensaje} />
      </MarcoBloque>
    );
  }
  if (!puedeVerCuadro(contexto.rol)) return null;

  const { desde, hasta } = rangoDelMes(contexto.ahora, contexto.hoy, contexto.zona);
  const r = await leerCitasRango(contexto.sesion, desde, hasta);

  return (
    <MarcoBloque id="agenda-cuadro" titulo={t('agenda.cuadro.titulo')}>
      {r.ok ? <Metricas {...metricasDelMes(filtrarPorCentro(r.filas, contexto.centro))} /> : <AvisoDeError mensaje={r.mensaje} />}
    </MarcoBloque>
  );
}

function Metricas({ asistencia, ausencia, cerradas }: MetricasDelMes) {
  const matiz = tCon('agenda.cuadro.matiz', { n: cerradas });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TarjetaMetrica etiqueta={t('agenda.cuadro.asistencia')} valor={porcentaje(asistencia)} detalle={matiz} />
      <TarjetaMetrica etiqueta={t('agenda.cuadro.ausencia')} valor={porcentaje(ausencia)} detalle={matiz} />
    </div>
  );
}
