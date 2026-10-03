import Link from 'next/link';
import type { ReactNode } from 'react';

import { AvisoDeError, Pildora } from '@/components/ui/piezas';
import { leerAlertasNotaPendiente } from '@/lib/citas/agenda';
import { t, tCon } from '@/lib/i18n';

import { criterioDocumentacion, diasPendiente, puedeResolverAlerta } from './bloques';
import { cargarContexto } from './datos';
import { EstadoVacio } from './estado-vacio';
import { MarcoBloque } from './marco';
import { ProveedorResolucion, ResolverAlerta } from './resolver-alerta';

function textoDesde(dias: number | null): string {
  if (dias === null) return t('agenda.documentacion.desde.sinFecha');
  // Una fecha de referencia «de mañana» sale del cálculo en UTC de la base (H12): cuenta como hoy.
  if (dias <= 0) return t('agenda.documentacion.desde.hoy');
  if (dias === 1) return t('agenda.documentacion.desde.una');
  return tCon('agenda.documentacion.desde.varias', { n: dias });
}

/** El bloque trae su propio marco, como el cuadro: sin tipos que ver no queda una tarjeta vacía. */
function Marco({ children }: { children: ReactNode }) {
  return (
    <MarcoBloque id="agenda-documentacion" titulo={t('agenda.documentacion.titulo')}>
      {/* Dentro del marco y en todas las ramas: el foco y el aviso de «resuelta» sobreviven a que
          la última alerta pase a «vacío» (T-015, R4). */}
      <ProveedorResolucion>{children}</ProveedorResolucion>
    </MarcoBloque>
  );
}

/**
 * Las alertas de documentación abiertas que la RLS deja ver (H12). Nada clínico: la tabla no
 * lo tiene. No se filtra por centro: lo que falta por firmar se firma aunque se mire otro.
 */
export async function Documentacion({ centroParametro }: { centroParametro: string | null }) {
  const contexto = await cargarContexto(centroParametro);
  if (!contexto.ok)
    return (
      <Marco>
        <AvisoDeError mensaje={contexto.mensaje} />
      </Marco>
    );

  // Qué ve cada rol, cerrado ante lo desconocido (choque 2, revisiones SQL H2, A1 y A2).
  const criterio = criterioDocumentacion(contexto.rol);
  if (criterio.tipos?.length === 0) return null;
  const r = await leerAlertasNotaPendiente(contexto.sesion, criterio);
  if (!r.ok)
    return (
      <Marco>
        <AvisoDeError mensaje={r.mensaje} />
      </Marco>
    );
  if (r.alertas.length === 0) {
    return (
      <Marco>
        <EstadoVacio
          icono="documento"
          titulo={t('agenda.documentacion.vacio')}
          explicacion={t('agenda.documentacion.vacioExplicacion')}
        />
      </Marco>
    );
  }

  return (
    <Marco>
      <ul className="divide-border flex flex-col divide-y">
        {r.alertas.map((alerta) => {
          const dias = diasPendiente(alerta.fechaReferencia, contexto.hoy);
          // El nivel lo calcula la base (T-015 §1.7); el nivel 1 es la presencia discreta en la lista.
          const pildora =
            alerta.nivel === 3
              ? t('agenda.documentacion.nivel3')
              : alerta.nivel === 2
                ? t('agenda.documentacion.nivel2')
                : null;
          const etiquetaTipo = t(`agenda.documentacion.tipos.${alerta.tipo}`);
          return (
            <li key={alerta.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <Link
                href={`/pacientes/${alerta.pacienteId}`}
                className="focus-visible:ring-ring/50 inline-flex min-h-11 items-center font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2"
              >
                {alerta.pacienteNombre ?? t('agenda.cita.paciente')}
              </Link>
              <span className="text-muted-foreground">
                {tCon('agenda.documentacion.fila', {
                  tipo: etiquetaTipo,
                  desde: textoDesde(dias),
                })}
              </span>
              {pildora && <Pildora tono="warning">{pildora}</Pildora>}
              {puedeResolverAlerta(contexto.rol, alerta.tipo) && (
                <ResolverAlerta alertaId={alerta.id} etiquetaTipo={etiquetaTipo} />
              )}
            </li>
          );
        })}
      </ul>
    </Marco>
  );
}
