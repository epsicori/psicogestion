import { CalendarClock, CalendarOff } from 'lucide-react';
import Link from 'next/link';

import { Pildora } from '@/components/ui/piezas';
import { formatearFechaLarga, formatearRango } from '@/lib/fechas';
import { t, tCon } from '@/lib/i18n';

import { Bloque, Dato, Vacio } from './bloques';
import {
  cargarAlertasDeDocumentacion,
  cargarCitasDelPaciente,
  cargarConsentimientos,
} from './datos';
import {
  estadoDocumental,
  resumirCitas,
  type CitaDeVista,
  type EstadoCita,
  type EstadoDocumental,
} from './presentacion';

/**
 * Resumen: última sesión, próxima cita y recuento de actividad.
 *
 * Todo lo que se lee aquí está **fuera del candado** —citas, alertas y consentimientos—, así
 * que se consulta en el renderizado del servidor y no por la acción de apertura. Ni una de
 * estas consultas escribe en `accesos_historia`: mirar cuándo viene alguien no es abrir su
 * historia (ADR-037).
 *
 * De las citas no sale ni el tipo de terapia ni la nota operativa. No es discreción de esta
 * pantalla: es que al técnico administrativo la vista `citas_agenda` no se los da (choque 4),
 * y una pantalla que enseñara dos columnas a unos y no a otros sería el sitio equivocado para
 * decidirlo.
 */

const ETIQUETA_ESTADO: Record<EstadoCita, () => string> = {
  programada: () => t('ficha.estadoProgramada'),
  confirmada: () => t('ficha.estadoConfirmada'),
  realizada: () => t('ficha.estadoRealizada'),
  cancelada: () => t('ficha.estadoCancelada'),
  no_asistida: () => t('ficha.estadoNoAsistida'),
};

const TONO_ESTADO: Record<EstadoCita, 'success' | 'info' | 'warning'> = {
  programada: 'info',
  confirmada: 'success',
  realizada: 'success',
  cancelada: 'warning',
  no_asistida: 'warning',
};

const ETIQUETA_DOCUMENTAL: Record<EstadoDocumental, () => string> = {
  al_dia: () => t('ficha.documentacionAlDia'),
  nuevo: () => t('ficha.documentacionNueva'),
  revisar: () => t('ficha.documentacionRevisar'),
};

const TONO_DOCUMENTAL: Record<EstadoDocumental, 'success' | 'info' | 'warning'> = {
  al_dia: 'success',
  nuevo: 'info',
  revisar: 'warning',
};

function Cita({ cita }: { cita: CitaDeVista }) {
  // La hora se compone en servidor y en la zona de la cita, y baja como cadena (ADR-034).
  // Un `new Date()` en cliente daría la zona del navegador y rompería la hidratación.
  const inicio = new Date(cita.inicio);
  const fin = new Date(cita.fin);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">{formatearFechaLarga(inicio, cita.zonaHoraria)}</p>
      <p className="text-muted-foreground text-sm">{formatearRango(inicio, fin, cita.zonaHoraria)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Pildora tono={TONO_ESTADO[cita.estado]}>{ETIQUETA_ESTADO[cita.estado]()}</Pildora>
        {cita.sala && (
          <span className="text-muted-foreground text-xs">
            {tCon('ficha.enLaSala', { sala: cita.sala })}
          </span>
        )}
      </div>
    </div>
  );
}

export async function PanelResumen({ pacienteId }: { pacienteId: string }) {
  const [citas, alertas, consentimientos] = await Promise.all([
    cargarCitasDelPaciente(pacienteId),
    cargarAlertasDeDocumentacion(pacienteId),
    cargarConsentimientos(pacienteId),
  ]);

  // `null` en alertas es un fallo de lectura, no «cero alertas»: sin ese dato no se puede
  // afirmar que la documentación está al día, así que la píldora no se pinta.
  const documental =
    alertas === null
      ? null
      : estadoDocumental({
          alertasAbiertas: alertas.length,
          consentimientos: consentimientos === null ? null : consentimientos.length,
        });

  if (citas === null) {
    return (
      <div className="flex flex-col gap-4">
        {documental && <Documentacion estado={documental} />}
        <NuevaCita pacienteId={pacienteId} />
        <Bloque titulo={t('ficha.actividad')}>
          <Vacio
            icono={<CalendarOff className="size-5" aria-hidden="true" />}
            frase={t('ficha.agendaNoVisible')}
            explicacion={t('ficha.agendaNoVisibleExplicacion')}
          />
        </Bloque>
      </div>
    );
  }

  const resumen = resumirCitas(citas);

  if (citas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {documental && <Documentacion estado={documental} />}
        <NuevaCita pacienteId={pacienteId} />
        <Bloque titulo={t('ficha.actividad')}>
          <Vacio
            icono={<CalendarClock className="size-5" aria-hidden="true" />}
            frase={t('ficha.sinCitas')}
            explicacion={t('ficha.sinCitasExplicacion')}
          />
        </Bloque>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {documental && <Documentacion estado={documental} />}
      <NuevaCita pacienteId={pacienteId} />

      <div className="grid gap-4 md:grid-cols-2">
        <Bloque titulo={t('ficha.ultimaSesion')}>
          {resumen.ultimaSesion ? (
            <Cita cita={resumen.ultimaSesion} />
          ) : (
            <p className="text-muted-foreground text-sm">{t('ficha.sinSesionesRealizadas')}</p>
          )}
        </Bloque>

        <Bloque titulo={t('ficha.proximaCita')}>
          {resumen.proximaCita ? (
            <Cita cita={resumen.proximaCita} />
          ) : (
            <p className="text-muted-foreground text-sm">{t('ficha.sinProximaCita')}</p>
          )}
        </Bloque>
      </div>

      <Bloque titulo={t('ficha.actividad')}>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Dato etiqueta={t('ficha.sesionesRealizadas')}>{resumen.realizadas}</Dato>
          <Dato etiqueta={t('ficha.citasNoAsistidas')}>{resumen.noAsistidas}</Dato>
          <Dato etiqueta={t('ficha.citasCanceladas')}>{resumen.canceladas}</Dato>
        </dl>
      </Bloque>
    </div>
  );
}

/**
 * T-028 C. Lleva al alta con el paciente fijado por su uuid (nunca su nombre en la URL). Lo
 * ven todos los roles, igual que el botón de la agenda: el alta es para los tres (el técnico
 * agenda sin ver tipo ni nota). Se pinta también cuando la agenda no es visible
 * (`citas === null`): solo lleva el uuid y `/agenda/nueva` ya filtra por permisos y RLS (H37).
 */
function NuevaCita({ pacienteId }: { pacienteId: string }) {
  return (
    <div className="flex justify-end">
      <Link
        href={`/agenda/nueva?paciente=${pacienteId}`}
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/50 inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold shadow-sm transition outline-none focus-visible:ring-2"
      >
        {t('agenda.alta.abrir')}
      </Link>
    </div>
  );
}

/**
 * La píldora del choque 7. Habla de **papeles**, no de la persona: «Al día», «Nuevo» y
 * «Revisar» describen si falta documentación. El nivel de riesgo tiene otro campo, otra
 * política y otro candado, y no comparte vocabulario con esto.
 */
function Documentacion({ estado }: { estado: EstadoDocumental }) {
  return (
    <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {t('ficha.documentacion')}
      </span>
      <Pildora tono={TONO_DOCUMENTAL[estado]}>{ETIQUETA_DOCUMENTAL[estado]()}</Pildora>
    </div>
  );
}
