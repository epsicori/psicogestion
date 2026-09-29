import { PuntoEstadoCita } from '@/components/ui/estado-cita';
import { AvisoDeError } from '@/components/ui/piezas';
import { estadoParaPunto, leerCitasRango } from '@/lib/citas/agenda';
import { formatearHora } from '@/lib/fechas/formato';
import { t } from '@/lib/i18n';

import { filtrarPorCentro, rangoDeProximas, seleccionarProximas } from './bloques';
import { cargarContexto } from './datos';
import { EstadoVacio } from './estado-vacio';
import { nombres } from './vista';

/**
 * Las cinco próximas citas de hoy y mañana (§1.6.1). Lista **no interactiva**: se consulta
 * de un vistazo; para abrir una cita está el calendario.
 */
export async function Proximas({ centroParametro }: { centroParametro: string | null }) {
  const contexto = await cargarContexto(centroParametro);
  if (!contexto.ok) return <AvisoDeError mensaje={contexto.mensaje} />;
  const { sesion, ahora, hoy, zona, centro } = contexto;

  const { desde, hasta } = rangoDeProximas(ahora, hoy, zona);
  const r = await leerCitasRango(sesion, desde, hasta);
  if (!r.ok) return <AvisoDeError mensaje={r.mensaje} />;

  const proximas = seleccionarProximas(filtrarPorCentro(r.filas, centro), ahora);
  if (proximas.length === 0) {
    return (
      <EstadoVacio
        icono="calendario"
        titulo={t('agenda.proximas.vacio')}
        explicacion={t('agenda.proximas.vacioExplicacion')}
      />
    );
  }

  return (
    <ul aria-label={t('agenda.proximas.lista')} className="divide-border flex flex-col divide-y">
      {proximas.map((fila) => (
        <li key={fila.id} className="flex min-h-11 items-center gap-3 py-2 text-sm">
          <span className="font-mono text-foreground">{formatearHora(fila.inicio, zona)}</span>
          <span className="flex-1 truncate text-foreground">{nombres(fila).nombreCorto}</span>
          <PuntoEstadoCita estado={estadoParaPunto(fila.estado, fila.enCurso)} conEtiqueta={false} late={false} />
        </li>
      ))}
    </ul>
  );
}
