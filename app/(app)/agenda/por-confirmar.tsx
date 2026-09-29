import { AvisoDeError } from '@/components/ui/piezas';
import { listarPropuestasPendientes } from '@/lib/citas/propuestas';
import { resumirPropuesta } from '@/lib/citas/presentacion';
import { t, tCon } from '@/lib/i18n';

import { esCambioDeHora } from './bloques';
import { cargarContexto } from './datos';
import { FilaPropuesta } from './fila-propuesta';
import { MarcoBloque } from './marco';

/** «Ana García López» → «Ana G.»: el mismo recorte que las citas del calendario. */
function nombreCorto(nombre: string | null, apellidos: string | null): string {
  if (nombre === null) return t('agenda.cita.paciente');
  const primero = nombre.trim().split(/\s+/)[0];
  const inicial = apellidos?.trim().charAt(0) ?? '';
  return inicial ? `${primero} ${inicial}.` : primero;
}

/**
 * Los cambios de una serie que esperan una decisión (T-014 §1.6.4, D15). Solo se pinta si hay
 * alguno: una lista vacía no es un estado que el usuario deba ver. El nombre del paciente sale
 * de `pacientes` por RLS; si no se puede leer, «Paciente».
 */
export async function PorConfirmar({ centroParametro }: { centroParametro: string | null }) {
  const contexto = await cargarContexto(centroParametro);
  if (!contexto.ok) {
    return (
      <MarcoBloque id="por-confirmar" titulo={t('agenda.porConfirmar.titulo')}>
        <AvisoDeError mensaje={contexto.mensaje} />
      </MarcoBloque>
    );
  }

  const r = await listarPropuestasPendientes(contexto.sesion);
  if (!r.ok) {
    return (
      <MarcoBloque id="por-confirmar" titulo={t('agenda.porConfirmar.titulo')}>
        <AvisoDeError mensaje={r.mensaje} />
      </MarcoBloque>
    );
  }
  if (r.propuestas.length === 0) return null;

  const ids = [...new Set(r.propuestas.map((p) => p.pacienteId))];
  const pacientes = await contexto.sesion.supabase.from('pacientes').select('id, nombre, apellidos').in('id', ids);
  const porId = new Map((pacientes.data ?? []).map((p) => [p.id, p]));

  return (
    <MarcoBloque id="por-confirmar" titulo={t('agenda.porConfirmar.titulo')}>
      <p className="text-muted-foreground mb-2 text-sm">{t('agenda.porConfirmar.explicacion')}</p>
      <ul className="divide-border flex flex-col divide-y">
        {r.propuestas.map((propuesta) => {
          const resumen = resumirPropuesta(propuesta);
          const paciente = porId.get(propuesta.pacienteId);
          return (
            <li key={propuesta.id}>
              <FilaPropuesta
                id={propuesta.id}
                nombre={nombreCorto(paciente?.nombre ?? null, paciente?.apellidos ?? null)}
                prevista={tCon('agenda.porConfirmar.prevista', {
                  fecha: resumen.fechaPrevistaCorta,
                  hora: resumen.horaLocalPrevista,
                })}
                motivo={t(`agenda.porConfirmar.motivos.${resumen.motivo}`)}
                propuesta={
                  resumen.rangoPropuesto ? tCon('agenda.porConfirmar.propuesta', { rango: resumen.rangoPropuesto }) : null
                }
                cambioDeHora={esCambioDeHora(propuesta.inicioPropuesto, propuesta.zonaHoraria)}
              />
            </li>
          );
        })}
      </ul>
    </MarcoBloque>
  );
}
