import { Ticket } from 'lucide-react';

import { AvisoDeError, EstadoVacio, Pildora, Tarjeta } from '@/components/ui/piezas';
import { formatearImporte } from '@/lib/dinero/importe';
import { formatearFechaSinZona } from '@/lib/fechas/relativo';
import { t, tCon } from '@/lib/i18n';

import { cargarBonos, cargarRelojDeBonos, pacienteAdmiteBonos, type BonoConPaciente } from '../../facturacion/bonos/datos';
import { ordenarBonos, pildoraDeEstado, textoExcedidas, textoQuedan } from '../../facturacion/bonos/presentacion';
import { RegistrarBono } from '../../facturacion/bonos/registrar-bono';
import { cargarPaciente } from './datos';

/**
 * La pestaña «Facturación» de la ficha (T-027 §1.7): los bonos del paciente, con lo que queda de cada uno.
 * Server Component, bajo RLS, sin caché (ADR-043). Aquí no hay campana ni recuento en la pestaña ni nada de
 * «facturar»: el bono no genera cobro (ADR-053). El aviso es una línea discreta bajo el bono que lo merece.
 */

function lineaDeAviso(bono: BonoConPaciente, zona: string): string | null {
  const { aviso, saldo } = bono.lectura;
  if (aviso === 'pocas') return saldo === 1 ? t('bonos.avisoPocas.una') : tCon('bonos.avisoPocas.varias', { n: saldo });
  if (aviso === 'caduca' && bono.caducidad) {
    return tCon('bonos.avisoCaduca', { fecha: formatearFechaSinZona(bono.caducidad, zona) });
  }
  return null;
}

/** Qué hacer ahora con un bono que ya no sirve, en palabras llanas (ADR-054). */
function queHacer(bono: BonoConPaciente, zona: string): string | null {
  if (bono.lectura.estado === 'agotado') return t('bonos.agotadoQueHacer');
  if (bono.lectura.estado === 'caducado' && bono.caducidad) {
    const fecha = formatearFechaSinZona(bono.caducidad, zona);
    return bono.lectura.saldo === 1
      ? tCon('bonos.caducadoQueHacer.una', { fecha })
      : tCon('bonos.caducadoQueHacer.varias', { fecha, n: bono.lectura.saldo });
  }
  return null;
}

export async function PanelBonos({ pacienteId }: { pacienteId: string }) {
  const [reloj, paciente, admite] = await Promise.all([
    cargarRelojDeBonos(),
    cargarPaciente(pacienteId),
    pacienteAdmiteBonos(pacienteId),
  ]);
  const resultado = await cargarBonos(reloj.hoy, pacienteId);

  const nombre = paciente ? `${paciente.nombre} ${paciente.apellidos}`.trim() : null;

  return (
    <section aria-labelledby="ficha-bonos" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="ficha-bonos" className="font-serif text-lg font-semibold text-foreground">
          {t('bonos.ficha.titulo')}
        </h3>
        {/* Solo si el paciente admite bonos (no está fusionado) y se conoce su nombre. */}
        {admite && nombre !== null && (
          <RegistrarBono pacienteFijo={{ id: pacienteId, nombre }} hoy={reloj.hoy} />
        )}
      </div>

      {!resultado.ok && <AvisoDeError mensaje={t('bonos.ficha.error')} />}
      {resultado.ok && resultado.bonos.length === 0 && (
        <Tarjeta className="p-5">
          <EstadoVacio
            icono={<Ticket className="size-5" aria-hidden="true" />}
            frase={t('bonos.ficha.vacio')}
            explicacion={t('bonos.ficha.vacioExplicacion')}
          />
        </Tarjeta>
      )}
      {resultado.ok && resultado.bonos.length > 0 && (
        <Tarjeta className="p-5">
          <ul className="flex flex-col gap-4">
            {ordenarBonos(resultado.bonos).map((bono) => {
              const pildora = pildoraDeEstado(bono.lectura.estado);
              const aviso = lineaDeAviso(bono, reloj.zona);
              const accion = queHacer(bono, reloj.zona);
              const excedidas = textoExcedidas(bono.lectura.excedidas);
              return (
                <li key={bono.bonoId} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {tCon('bonos.usadas', { usadas: bono.sesionesConsumidas, totales: bono.sesionesTotales })}
                    </p>
                    <Pildora tono={pildora.tono}>{pildora.texto}</Pildora>
                  </div>
                  <p className="text-xs break-words text-muted-foreground">
                    {`${textoQuedan(bono.lectura.saldo)} · ${tCon('bonos.importeDelBono', { importe: formatearImporte(bono.importe) })} · ${
                      bono.caducidad
                        ? tCon('bonos.caducaEl', { fecha: formatearFechaSinZona(bono.caducidad, reloj.zona) })
                        : t('bonos.sinCaducidad')
                    }`}
                  </p>
                  {excedidas && <p className="text-xs font-medium text-accent-foreground">{excedidas}</p>}
                  {aviso && <p className="text-xs font-medium text-accent-foreground">{aviso}</p>}
                  {accion && <p className="text-xs break-words text-muted-foreground">{accion}</p>}
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      )}
    </section>
  );
}
