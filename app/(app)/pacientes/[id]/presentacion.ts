// Funciones puras de la ficha: nada de Supabase, nada de React. Se prueban solas y por eso
// viven aparte de la pantalla.
import { differenceInMonths, differenceInYears, format } from 'date-fns';
import { es } from 'date-fns/locale';

import type { Database } from '@/lib/supabase/tipos-bd';

export type NivelDeRiesgo = Database['public']['Enums']['nivel_riesgo'];
export type ModalidadRelacional = Database['public']['Enums']['modalidad_relacional'];

/**
 * Cuánto vale una valoración de riesgo antes de que enseñarla sin más induzca a error.
 *
 * **Tres meses, criterio del propietario del producto el 15-09-2026**: la valoración de riesgo
 * se usa como seguimiento activo, no como una foto de la primera consulta, así que se revisa
 * cada trimestre. Está en una constante con nombre, y no repartido por la pantalla, para que
 * cambiarlo vuelva a ser una línea. La interfaz no oculta la valoración vieja ni la llama
 * caducada: sigue enseñando el nivel y la fecha, y añade que conviene revisarlo.
 */
export const MESES_VALORACION_VIGENTE = 3;

/** Años cumplidos, o `null` si no consta la fecha de nacimiento. */
export function edadEnAnios(fechaNacimiento: string | null, ahora: Date = new Date()): number | null {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;

  const anios = differenceInYears(ahora, nacimiento);
  // Una fecha de nacimiento en el futuro es un dato mal metido, no una edad negativa.
  return anios < 0 ? null : anios;
}

/** Si la valoración lleva más de `MESES_VALORACION_VIGENTE` sin repetirse. */
export function valoracionEsAntigua(valoradoEn: string, ahora: Date = new Date()): boolean {
  const fecha = new Date(valoradoEn);
  if (Number.isNaN(fecha.getTime())) return false;
  return differenceInMonths(ahora, fecha) >= MESES_VALORACION_VIGENTE;
}

/**
 * Minutos que faltan para `iso`, redondeados hacia arriba; negativo si ya pasó.
 *
 * El candado de la ficha y el de `/candado` cuentan igual a propósito: si la pantalla de la
 * ficha redondease hacia abajo, diría «0 min» treinta segundos antes de cerrarse de verdad.
 */
export function minutosRestantes(iso: string, ahora: Date = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - ahora.getTime()) / 60000);
}

export type DiagnosticoDeVista = {
  id: string;
  codigo: string;
  descripcion: string | null;
  principal: boolean;
  retiradoEn: string | null;
};

export type EpisodioDeVista = {
  id: string;
  motivo: string | null;
  modalidad: ModalidadRelacional;
  abiertoEn: string;
  cerradoEn: string | null;
  diagnosticos: DiagnosticoDeVista[];
};

type FilaEpisodio = {
  id: string;
  motivo_consulta: string | null;
  modalidad_relacional: ModalidadRelacional;
  abierto_en: string;
  cerrado_en: string | null;
};

type FilaDiagnostico = {
  id: string;
  episodio_id: string;
  cie10es_codigo: string;
  cie10es_descripcion: string | null;
  principal: boolean;
  retirado_en: string | null;
};

/**
 * Cuelga cada diagnóstico de su episodio. Se hace aquí y no con un `select` anidado porque
 * `diagnosticos` tiene política propia: un diagnóstico que RLS no deja ver **no llega**, y
 * entonces su episodio se pinta sin él en vez de desaparecer entero.
 *
 * Lo que llega sin episodio conocido se descarta en silencio: sería un diagnóstico huérfano
 * de un episodio que no podemos leer, y enseñarlo suelto diría que existe.
 */
export function agruparPorEpisodio(
  episodios: FilaEpisodio[],
  diagnosticos: FilaDiagnostico[],
): EpisodioDeVista[] {
  const porEpisodio = new Map<string, DiagnosticoDeVista[]>();

  for (const d of diagnosticos) {
    const lista = porEpisodio.get(d.episodio_id);
    const vista: DiagnosticoDeVista = {
      id: d.id,
      codigo: d.cie10es_codigo,
      descripcion: d.cie10es_descripcion,
      principal: d.principal,
      retiradoEn: d.retirado_en,
    };
    if (lista) lista.push(vista);
    else porEpisodio.set(d.episodio_id, [vista]);
  }

  return episodios.map((e) => ({
    id: e.id,
    motivo: e.motivo_consulta,
    modalidad: e.modalidad_relacional,
    abiertoEn: e.abierto_en,
    cerradoEn: e.cerrado_en,
    // El principal primero, y dentro de cada grupo el vigente antes que el retirado: es el
    // orden en que se lee un historial, no el que devuelva la base.
    diagnosticos: (porEpisodio.get(e.id) ?? []).sort(
      (a, b) =>
        Number(b.principal) - Number(a.principal) ||
        Number(a.retiradoEn !== null) - Number(b.retiradoEn !== null),
    ),
  }));
}

/**
 * «29 de marzo de 2026». Sin día de la semana y **sin zona**: se usa para fechas que en la
 * base son un día, no un instante —el alta, la firma de un consentimiento, la vigencia de un
 * representante—. Las horas de las citas NO pasan por aquí: esas llevan su `zona_horaria` y
 * se formatean con `lib/fechas` (ADR-034).
 */
export function fechaLarga(iso: string): string {
  return format(new Date(iso), "d 'de' MMMM 'de' yyyy", { locale: es });
}

export type EstadoCita = Database['public']['Enums']['estado_cita'];

/** Lo que la ficha necesita de una cita, y nada más: ni tipo de terapia ni nota operativa. */
export type CitaDeVista = {
  id: string;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  zonaHoraria: string;
  sala: string | null;
};

export type ResumenDeActividad = {
  ultimaSesion: CitaDeVista | null;
  proximaCita: CitaDeVista | null;
  realizadas: number;
  noAsistidas: number;
  canceladas: number;
};

const instante = (cita: CitaDeVista) => new Date(cita.inicio).getTime();

/**
 * La última sesión, la próxima cita y el recuento, a partir de las citas que RLS haya dejado
 * llegar.
 *
 * «Última sesión» es la última **realizada**, no la última pasada: una cita a la que nadie
 * acudió no es una sesión, y enseñarla como tal haría creer que hubo trabajo donde no lo hubo.
 * «Próxima cita» excluye las canceladas por el mismo motivo.
 *
 * Las citas con fecha ilegible se descartan en silencio en vez de envenenar el orden: un
 * `NaN` en una comparación deja el máximo indefinido y la pantalla mentiría entera por una
 * fila mala.
 */
export function resumirCitas(citas: CitaDeVista[], ahora: Date = new Date()): ResumenDeActividad {
  const sanas = citas.filter((c) => !Number.isNaN(instante(c)));
  const corte = ahora.getTime();

  const realizadas = sanas.filter((c) => c.estado === 'realizada');
  const porDelante = sanas.filter(
    (c) => instante(c) > corte && (c.estado === 'programada' || c.estado === 'confirmada'),
  );

  return {
    ultimaSesion: realizadas.reduce<CitaDeVista | null>(
      (mejor, c) => (mejor === null || instante(c) > instante(mejor) ? c : mejor),
      null,
    ),
    proximaCita: porDelante.reduce<CitaDeVista | null>(
      (mejor, c) => (mejor === null || instante(c) < instante(mejor) ? c : mejor),
      null,
    ),
    realizadas: realizadas.length,
    noAsistidas: sanas.filter((c) => c.estado === 'no_asistida').length,
    canceladas: sanas.filter((c) => c.estado === 'cancelada').length,
  };
}

export type EstadoDeConsentimiento = 'firmado' | 'retirado' | 'sin_firmar';

/**
 * Retirado gana a firmado: un consentimiento revocado se firmó en su día, y pintarlo como
 * «Firmado» porque tiene fecha de otorgamiento sería decir que sigue valiendo.
 */
export function estadoDeConsentimiento(consentimiento: {
  otorgadoEn: string | null;
  revocadoEn: string | null;
}): EstadoDeConsentimiento {
  if (consentimiento.revocadoEn) return 'retirado';
  return consentimiento.otorgadoEn ? 'firmado' : 'sin_firmar';
}

export type EstadoDocumental = 'al_dia' | 'nuevo' | 'revisar';

/**
 * La píldora del choque 7: describe **los papeles**, jamás al paciente. El nivel de riesgo es
 * otro campo, con otra política y otro candado, y no se mezcla aquí.
 *
 * `consentimientos: null` significa «quien mira no puede leerlos», que no es lo mismo que
 * «no hay ninguno». Sin ese dato solo se puede afirmar que algo está pendiente —las alertas
 * sí las ve recepción—, y si no hay alertas no se afirma nada: devuelve `null` y el bloque
 * desaparece entero (choque 5), en vez de decirle «Al día» a quien no ha podido comprobarlo.
 */
export function estadoDocumental(entrada: {
  alertasAbiertas: number;
  consentimientos: number | null;
}): EstadoDocumental | null {
  if (entrada.alertasAbiertas > 0) return 'revisar';
  if (entrada.consentimientos === null) return null;
  return entrada.consentimientos === 0 ? 'nuevo' : 'al_dia';
}

/**
 * Si la representación está en vigor hoy. `vigente_hasta` nulo es «sin fecha de fin», que es
 * el caso normal de una madre o un padre; una fecha pasada es un vínculo que ya no habilita a
 * nadie y se sigue enseñando, pero dicho.
 */
export function representacionVigente(
  representante: { vigenteDesde: string; vigenteHasta: string | null },
  ahora: Date = new Date(),
): boolean {
  const desde = new Date(representante.vigenteDesde).getTime();
  if (Number.isNaN(desde) || desde > ahora.getTime()) return false;
  if (!representante.vigenteHasta) return true;

  const hasta = new Date(representante.vigenteHasta).getTime();
  return Number.isNaN(hasta) ? true : hasta > ahora.getTime();
}
