import { CircleCheck, FileLock, Signature } from 'lucide-react';

import { Pildora } from '@/components/ui/piezas';
import { t, tCon } from '@/lib/i18n';

import { Bloque, Vacio } from './bloques';
import {
  cargarAlertasDeDocumentacion,
  cargarConsentimientos,
  type AlertaDeVista,
  type ConsentimientoDeVista,
} from './datos';
import { estadoDeConsentimiento, fechaLarga, type EstadoDeConsentimiento } from './presentacion';

/**
 * Documentos y consentimientos. **Fuera del candado y sin PIN** (ADR-048, choque 12):
 * «¿tenemos su consentimiento?» es una pregunta de recepción que se hace veinte veces al día,
 * y un candado que hay que abrir para eso deja de ser un candado y pasa a ser un peaje.
 *
 * Lenguaje claro (ADR-054) en todo lo que **rodea** al documento: el título, la explicación de
 * qué autoriza y el estado. **El texto firmado no se toca**: se guarda y se enseña verbatim,
 * tal y como se firmó, dentro de un desplegable. Simplificarlo sería cambiar lo que la persona
 * consintió.
 *
 * El técnico administrativo no puede leer `consentimientos` —su política es `administrador or
 * es_profesional_asignado`— y aquí se le dice, no se le enseña una lista vacía. Lo que sí ve
 * es el bloque de abajo: `alertas_documentacion` incluye `consentimiento_pendiente`, no lleva
 * ni una palabra clínica y su política tiene una rama para él acotada a sus centros. Es decir:
 * puede saber que falta un papel sin poder leer el papel.
 */

const ETIQUETA_TIPO: Record<ConsentimientoDeVista['tipo'], () => string> = {
  asistencial: () => t('ficha.consentimientoAsistencial'),
  terapia_pareja_familiar: () => t('ficha.consentimientoTerapiaParejaFamiliar'),
  tratamiento_datos: () => t('ficha.consentimientoTratamientoDatos'),
  cesion_informacion: () => t('ficha.consentimientoCesionInformacion'),
  grabacion: () => t('ficha.consentimientoGrabacion'),
  otro: () => t('ficha.consentimientoOtro'),
};

const EXPLICACION_TIPO: Record<ConsentimientoDeVista['tipo'], () => string> = {
  asistencial: () => t('ficha.consentimientoAsistencialExplicacion'),
  terapia_pareja_familiar: () => t('ficha.consentimientoTerapiaParejaFamiliarExplicacion'),
  tratamiento_datos: () => t('ficha.consentimientoTratamientoDatosExplicacion'),
  cesion_informacion: () => t('ficha.consentimientoCesionInformacionExplicacion'),
  grabacion: () => t('ficha.consentimientoGrabacionExplicacion'),
  otro: () => t('ficha.consentimientoOtroExplicacion'),
};

const ETIQUETA_ESTADO: Record<EstadoDeConsentimiento, () => string> = {
  firmado: () => t('ficha.consentimientoFirmado'),
  retirado: () => t('ficha.consentimientoRetirado'),
  sin_firmar: () => t('ficha.consentimientoSinFirmar'),
};

const TONO_ESTADO: Record<EstadoDeConsentimiento, 'success' | 'info' | 'warning'> = {
  firmado: 'success',
  retirado: 'warning',
  sin_firmar: 'info',
};

const ETIQUETA_ALERTA: Record<AlertaDeVista['tipo'], () => string> = {
  nota_sin_firmar: () => t('ficha.alertaNotaSinFirmar'),
  borrador_abandonado: () => t('ficha.alertaBorradorAbandonado'),
  consentimiento_pendiente: () => t('ficha.alertaConsentimientoPendiente'),
  informe_pendiente: () => t('ficha.alertaInformePendiente'),
  evaluacion_sin_corregir: () => t('ficha.alertaEvaluacionSinCorregir'),
};

/** La fecha que toca según el estado, para no anidar tres ternarios dentro del JSX. */
function fechaDelEstado(consentimiento: ConsentimientoDeVista): string {
  const estado = estadoDeConsentimiento(consentimiento);
  if (estado === 'retirado' && consentimiento.revocadoEn) {
    return tCon('ficha.retiradoEl', { fecha: fechaLarga(consentimiento.revocadoEn) });
  }
  if (estado === 'firmado' && consentimiento.otorgadoEn) {
    return tCon('ficha.firmadoEl', { fecha: fechaLarga(consentimiento.otorgadoEn) });
  }
  return t('ficha.pendienteDeFirma');
}

function Consentimiento({ consentimiento }: { consentimiento: ConsentimientoDeVista }) {
  const estado = estadoDeConsentimiento(consentimiento);

  return (
    <li className="border-border border-t px-4 py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{ETIQUETA_TIPO[consentimiento.tipo]()}</span>
        <Pildora tono={TONO_ESTADO[estado]}>{ETIQUETA_ESTADO[estado]()}</Pildora>
      </div>

      <p className="text-muted-foreground mt-1 text-sm">
        {EXPLICACION_TIPO[consentimiento.tipo]()}
      </p>

      <p className="text-muted-foreground mt-2 text-xs">{fechaDelEstado(consentimiento)}</p>

      {consentimiento.menorOidoEn && (
        <p className="text-muted-foreground mt-1 text-xs">{t('ficha.menorOido')}</p>
      )}

      {consentimiento.firmantes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {consentimiento.firmantes.map((firmante) => (
            <li key={firmante.id} className="text-muted-foreground text-xs">
              {firmante.firmadoEn
                ? tCon('ficha.firmadoPor', { nombre: firmante.nombreCompleto })
                : tCon('ficha.firmantePendiente', { nombre: firmante.nombreCompleto })}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {consentimiento.textoVersion && (
          <span className="text-muted-foreground text-xs">
            {tCon('ficha.versionDelTexto', { version: consentimiento.textoVersion })}
          </span>
        )}
        {consentimiento.hayCopiaArchivada && (
          <span className="text-muted-foreground text-xs">{t('ficha.copiaArchivada')}</span>
        )}
      </div>

      {/* Verbatim y en un desplegable nativo: ni resumido, ni reescrito, ni traducido a
          lenguaje claro. Lo que se simplifica es lo de arriba. */}
      {consentimiento.textoFirmado ? (
        <details className="mt-3">
          <summary className="focus-visible:ring-ring/50 inline-flex min-h-11 cursor-pointer items-center text-sm font-medium outline-none focus-visible:ring-2">
            {t('ficha.verElTexto')}
          </summary>
          <p className="border-border bg-muted/40 mt-2 rounded-lg border px-4 py-3 text-sm whitespace-pre-wrap">
            {consentimiento.textoFirmado}
          </p>
        </details>
      ) : (
        <p className="text-muted-foreground mt-3 text-xs">{t('ficha.textoNoGuardado')}</p>
      )}
    </li>
  );
}

export async function PanelDocumentos({ pacienteId }: { pacienteId: string }) {
  const [consentimientos, alertas] = await Promise.all([
    cargarConsentimientos(pacienteId),
    cargarAlertasDeDocumentacion(pacienteId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Bloque titulo={t('ficha.consentimientos')}>
        <Consentimientos consentimientos={consentimientos} />
      </Bloque>

      {alertas !== null && (
        <Bloque titulo={t('ficha.pendientes')}>
          <Pendientes alertas={alertas} />
        </Bloque>
      )}
    </div>
  );
}

function Consentimientos({
  consentimientos,
}: {
  consentimientos: ConsentimientoDeVista[] | null;
}) {
  if (consentimientos === null) {
    return (
      <Vacio
        icono={<FileLock className="size-5" aria-hidden="true" />}
        frase={t('ficha.consentimientosNoVisibles')}
        explicacion={t('ficha.consentimientosNoVisiblesExplicacion')}
      />
    );
  }

  if (consentimientos.length === 0) {
    return (
      <Vacio
        icono={<Signature className="size-5" aria-hidden="true" />}
        frase={t('ficha.sinConsentimientos')}
        explicacion={t('ficha.sinConsentimientosExplicacion')}
      />
    );
  }

  return (
    <ul className="border-border overflow-hidden rounded-lg border">
      {consentimientos.map((consentimiento) => (
        <Consentimiento key={consentimiento.id} consentimiento={consentimiento} />
      ))}
    </ul>
  );
}

/** Lo único de esta pestaña que ve el técnico administrativo, y basta para su pregunta. */
function Pendientes({ alertas }: { alertas: AlertaDeVista[] }) {
  if (alertas.length === 0) {
    return (
      <Vacio
        icono={<CircleCheck className="size-5" aria-hidden="true" />}
        frase={t('ficha.sinPendientes')}
        explicacion={t('ficha.sinPendientesExplicacion')}
      />
    );
  }

  return (
    <ul className="border-border overflow-hidden rounded-lg border">
      {alertas.map((alerta) => (
        <li key={alerta.id} className="border-border border-t px-4 py-3 first:border-t-0">
          <p className="text-sm">{ETIQUETA_ALERTA[alerta.tipo]()}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {tCon('ficha.desdeEl', {
              fecha: fechaLarga(alerta.fechaReferencia ?? alerta.creadaEn),
            })}
          </p>
        </li>
      ))}
    </ul>
  );
}
