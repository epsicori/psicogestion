import { PhoneOff, Users } from 'lucide-react';

import { Pildora } from '@/components/ui/piezas';
import { t, tCon } from '@/lib/i18n';

import { Bloque, Dato, Vacio } from './bloques';
import {
  cargarNombreDeProfesional,
  cargarPaciente,
  cargarRepresentantes,
  type RepresentanteDeVista,
} from './datos';
import { fechaLarga, representacionVigente } from './presentacion';

/**
 * Ficha del paciente: contacto y gestión asistencial. Fuera del candado.
 *
 * Lo que el contrato pedía y **no está**, con el motivo de cada uno:
 *   · el teléfono del propio paciente — no existe la columna en ninguna tabla, y la única de
 *     una persona en todo el esquema es `representantes_paciente.telefono`. Se enseña esa y
 *     se dice de quién es, porque un rótulo «Teléfono» con el número de otra persona debajo
 *     sería peor que no tenerlo;
 *   · el DNI y el domicilio — están en `pacientes_identificacion`, cifrados, y no hay hoy
 *     camino de descifrado escrito;
 *   · la modalidad relacional — vive en `episodios_asistenciales`, y esa tabla sí está bajo
 *     el candado. Sacarla aquí sería la segunda puerta del choque 11, así que la modalidad se
 *     lee donde se registra el acceso: dentro de Historial clínico.
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

export async function PanelDatos({ pacienteId }: { pacienteId: string }) {
  const paciente = await cargarPaciente(pacienteId);
  if (!paciente) return null;

  const [profesional, representantes] = await Promise.all([
    cargarNombreDeProfesional(paciente.profesionalId),
    cargarRepresentantes(pacienteId),
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
        </dl>
      </Bloque>

      <Bloque titulo={t('ficha.contacto')}>
        <Contacto representantes={representantes} />
      </Bloque>
    </div>
  );
}

/**
 * `null` significa que este rol no puede leer la tabla, y se dice con esas palabras. Un
 * «no hay ninguna persona de contacto» dicho a quien lo que pasa es que no puede verlas sería
 * afirmar un hecho falso sobre el expediente, que es exactamente lo que el choque 5 prohíbe.
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

  return (
    <>
      <p className="text-muted-foreground mb-3 text-xs">{t('ficha.sinTelefonoDelPaciente')}</p>
      <ul className="border-border overflow-hidden rounded-lg border">
        {representantes.map((representante) => (
          <Representante key={representante.id} representante={representante} />
        ))}
      </ul>
    </>
  );
}
