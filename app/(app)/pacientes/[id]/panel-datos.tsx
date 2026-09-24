import { FileLock, PhoneOff, Users } from 'lucide-react';

import { Pildora } from '@/components/ui/piezas';
import { formatearTelefono } from '@/lib/identidad';
import { t, tCon } from '@/lib/i18n';

import { Bloque, Dato, Vacio } from './bloques';
import {
  cargarIdentificacion,
  cargarNombreDeProfesional,
  cargarPaciente,
  cargarRepresentantes,
  cargarSaludBasica,
  type DatosDeCabecera,
  type DatosDeIdentificacion,
  type Legible,
  type RepresentanteDeVista,
} from './datos';
import { fechaLarga, representacionVigente } from './presentacion';

/**
 * Ficha del paciente: identificación, contacto y gestión asistencial. Fuera del candado.
 *
 * Lo que el contrato pedía y **no está**, con el motivo:
 *   · la modalidad relacional — vive en `episodios_asistenciales`, y esa tabla sí está bajo
 *     el candado. Sacarla aquí sería la segunda puerta del choque 11, así que la modalidad se
 *     lee donde se registra el acceso: dentro de Historial clínico.
 *
 * Lo que **sí** entró en T-032 (Corte B), donde antes no había camino:
 *   · el teléfono y el sexo del propio paciente — `pacientes.telefono` y `pacientes.sexo`
 *     existen desde esta migración; el bloque de gestión los enseña directamente, y el
 *     párrafo que decía que no había teléfono del paciente se retira: dejarlo sería mentir;
 *   · el documento y el domicilio — se leen con `cargarIdentificacion()`, que solo llama a
 *     `leer_identificacion()` (ADR-060): un `select` directo a `pacientes_identificacion`
 *     no dejaría rastro en `auditoria`, y ese rastro es el punto entero de la corrección.
 */

const ETIQUETA_TIPO: Record<RepresentanteDeVista['tipo'], () => string> = {
  progenitor: () => t('ficha.representanteProgenitor'),
  tutor: () => t('ficha.representanteTutor'),
  acogedor: () => t('ficha.representanteAcogedor'),
  guardador_de_hecho: () => t('ficha.representanteGuardadorDeHecho'),
  representante_judicial: () => t('ficha.representanteRepresentanteJudicial'),
};

const ETIQUETA_ALCANCE: Record<RepresentanteDeVista['alcance'], () => string> = {
  patria_potestad: () => t('ficha.alcancePatriaPotestad'),
  custodia: () => t('ficha.alcanceCustodia'),
  solo_contacto: () => t('ficha.alcanceSoloContacto'),
};

function Representante({ representante }: { representante: RepresentanteDeVista }) {
  const vigente = representacionVigente(representante);

  return (
    <li className="border-border border-t px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {representante.nombre} {representante.apellidos}
        </span>
        <Pildora tono={vigente ? 'success' : 'warning'}>
          {ETIQUETA_TIPO[representante.tipo]()}
        </Pildora>
        <span className="text-muted-foreground text-xs">
          {ETIQUETA_ALCANCE[representante.alcance]()}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Dato etiqueta={t('ficha.telefono')}>
          {representante.telefono ?? t('ficha.sinTelefono')}
        </Dato>
        <Dato etiqueta={t('ficha.correo')}>{representante.correo ?? t('ficha.sinCorreo')}</Dato>
      </dl>

      <p className="text-muted-foreground mt-2 text-xs">
        {vigente
          ? tCon('ficha.vigenteDesde', { fecha: fechaLarga(representante.vigenteDesde) })
          : t('ficha.yaNoVigente')}
      </p>
    </li>
  );
}

const ETIQUETA_SEXO: Record<NonNullable<DatosDeCabecera['sexo']>, () => string> = {
  hombre: () => t('ficha.sexoHombre'),
  mujer: () => t('ficha.sexoMujer'),
  otro: () => t('ficha.sexoOtro'),
};

export async function PanelDatos({ pacienteId }: { pacienteId: string }) {
  const paciente = await cargarPaciente(pacienteId);
  if (!paciente) return null;

  const [profesional, representantes, identificacion, saludBasica] = await Promise.all([
    cargarNombreDeProfesional(paciente.profesionalId),
    cargarRepresentantes(pacienteId),
    cargarIdentificacion(pacienteId),
    cargarSaludBasica(pacienteId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Bloque titulo={t('ficha.gestionAsistencial')}>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Dato etiqueta={t('ficha.centro')}>{paciente.centro ?? t('ficha.sinCentro')}</Dato>
          <Dato etiqueta={t('ficha.profesionalResponsable')}>
            {profesional ?? t('ficha.sinProfesional')}
          </Dato>
          <Dato etiqueta={t('ficha.titularidad')}>
            {paciente.titularidad === 'organizacion'
              ? t('ficha.titularidadOrganizacion')
              : t('ficha.titularidadProfesional')}
          </Dato>
          <Dato etiqueta={t('ficha.alta')}>{fechaLarga(paciente.creadoEn)}</Dato>
          <Dato etiqueta={t('ficha.telefono')}>
            {paciente.telefono
              ? (formatearTelefono(paciente.telefono) ?? paciente.telefono)
              : t('ficha.sinTelefono')}
          </Dato>
          <Dato etiqueta={t('ficha.sexo')}>
            {paciente.sexo ? ETIQUETA_SEXO[paciente.sexo]() : t('ficha.sinSexo')}
          </Dato>
        </dl>
      </Bloque>

      {identificacion && <Identificacion identificacion={identificacion} />}

      {saludBasica && (
        <Bloque titulo={t('ficha.alergiasYMedicacion')}>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Dato etiqueta={t('ficha.alergias')}>
              {saludBasica.alergias ?? t('ficha.sinAlergias')}
            </Dato>
            <Dato etiqueta={t('ficha.medicacionActual')}>
              {saludBasica.medicacionActual ?? t('ficha.sinMedicacion')}
            </Dato>
          </dl>
        </Bloque>
      )}

      <Bloque titulo={t('ficha.contacto')}>
        <Contacto representantes={representantes} />
      </Bloque>
    </div>
  );
}

/**
 * `identificacion` ya no es `null` aquí (`PanelDatos` no pinta el bloque si lo es): quedan
 * los tres estados que sí importan a la pantalla. `no-legible` no es «sin documento»: el
 * dato existe y no se puede descifrar, y decir lo contrario sería afirmar un hecho falso
 * sobre el expediente (choque 5).
 */
function Identificacion({
  identificacion,
}: {
  identificacion: Legible<DatosDeIdentificacion>;
}) {
  return (
    <Bloque titulo={t('ficha.identificacion')}>
      {identificacion.estado === 'no-legible' ? (
        <Vacio
          icono={<FileLock className="size-5" aria-hidden="true" />}
          frase={t('ficha.identificacionNoLegible')}
          explicacion={t('ficha.identificacionNoLegibleExplicacion')}
        />
      ) : (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Dato etiqueta={t('ficha.documento')}>
            {identificacion.estado === 'ok' && identificacion.datos.documento
              ? identificacion.datos.documento
              : t('ficha.sinDocumento')}
          </Dato>
          <Dato etiqueta={t('ficha.domicilio')}>
            {identificacion.estado === 'ok' && identificacion.datos.domicilio
              ? identificacion.datos.domicilio
              : t('ficha.sinDomicilio')}
          </Dato>
        </dl>
      )}
    </Bloque>
  );
}

/**
 * `null` significa que este rol no puede leer la tabla, y se dice con esas palabras. Un
 * «no hay ninguna persona de contacto» dicho a quien lo que pasa es que no puede verlas sería
 * afirmar un hecho falso sobre el expediente, que es exactamente lo que el choque 5 prohíbe.
 *
 * Dos listas, no una: `patria_potestad` y `custodia` **firman**; `solo_contacto` **no puede
 * consentir ni firmar por el paciente**. Mezclarlas invitaría a pedirle la firma a quien no
 * puede darla, así que cada `alcance` vive en su propia lista con su propio rótulo.
 */
function Contacto({ representantes }: { representantes: RepresentanteDeVista[] | null }) {
  if (representantes === null) {
    return (
      <Vacio
        icono={<PhoneOff className="size-5" aria-hidden="true" />}
        frase={t('ficha.contactoNoVisible')}
        explicacion={t('ficha.contactoNoVisibleExplicacion')}
      />
    );
  }

  if (representantes.length === 0) {
    return (
      <Vacio
        icono={<Users className="size-5" aria-hidden="true" />}
        frase={t('ficha.sinRepresentantes')}
        explicacion={t('ficha.sinRepresentantesExplicacion')}
      />
    );
  }

  const representacionLegal = representantes.filter(
    (r) => r.alcance === 'patria_potestad' || r.alcance === 'custodia',
  );
  const contactoDeEmergencia = representantes.filter((r) => r.alcance === 'solo_contacto');

  return (
    <div className="flex flex-col gap-5">
      <ListaDeContacto
        titulo={t('ficha.representacionLegal')}
        representantes={representacionLegal}
        vacio={t('ficha.sinRepresentacionLegal')}
      />
      <ListaDeContacto
        titulo={t('ficha.contactoDeEmergencia')}
        representantes={contactoDeEmergencia}
        vacio={t('ficha.sinContactoDeEmergencia')}
        explicacion={t('ficha.contactoDeEmergenciaExplicacion')}
      />
    </div>
  );
}

function ListaDeContacto({
  titulo,
  representantes,
  vacio,
  explicacion,
}: {
  titulo: string;
  representantes: RepresentanteDeVista[];
  vacio: string;
  explicacion?: string;
}) {
  return (
    <div>
      <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {titulo}
      </h4>
      {explicacion && <p className="text-muted-foreground mt-1 text-xs">{explicacion}</p>}

      {representantes.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">{vacio}</p>
      ) : (
        <ul className="border-border mt-2 overflow-hidden rounded-lg border">
          {representantes.map((representante) => (
            <Representante key={representante.id} representante={representante} />
          ))}
        </ul>
      )}
    </div>
  );
}
