import 'server-only';

import { cache } from 'react';

import { descifrarIdentificacion, type FilaIdentificacion } from '@/lib/cifrado/identificacion';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { exigirSesion } from '@/lib/supabase/sesion';
import type { Database } from '@/lib/supabase/tipos-bd';

import type { CitaDeVista } from './presentacion';

/**
 * Lecturas de la ficha del paciente, memoizadas POR PETICIÓN con `cache()` de React.
 *
 * NUNCA `use cache` (ADR-043): guardaría el resultado entre peticiones y le serviría a un
 * profesional el paciente de otro. Ni siquiera `use cache: private`.
 *
 * **Aquí no se lee nada de lo que el candado tapa.** El motivo de consulta, los episodios,
 * los diagnósticos y el nivel de riesgo viven detrás de `historia_desbloqueada()` y llegan
 * por la Server Action de apertura (ADR-056), que es la que deja la fila en
 * `accesos_historia`. Traerlos aquí sería la segunda puerta del choque 11.
 */

export type DatosDeCabecera = {
  id: string;
  nombre: string;
  apellidos: string;
  creadoEn: string;
  fechaNacimiento: string | null;
  // T-032 · el teléfono y el sexo administrativo viven ya en `pacientes` (antes solo el de
  // su representante existía en todo el esquema): se leen aquí, junto al resto de la
  // cabecera, porque son la misma fila y la misma consulta.
  telefono: string | null;
  sexo: Database['public']['Enums']['sexo_administrativo'] | null;
  centro: string | null;
  profesionalId: string;
  titularidad: Database['public']['Enums']['titularidad_paciente'];
};

/** Nulo si el paciente no existe **o si RLS no deja verlo**: para la pantalla es lo mismo. */
export const cargarPaciente = cache(async (id: string): Promise<DatosDeCabecera | null> => {
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase
    .from('pacientes')
    .select(
      'id, nombre, apellidos, creado_en, fecha_nacimiento, telefono, sexo, profesional_id, titularidad, centros(nombre)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('cargarPaciente: fallo al leer el paciente', error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    nombre: data.nombre,
    apellidos: data.apellidos,
    creadoEn: data.creado_en,
    fechaNacimiento: data.fecha_nacimiento,
    telefono: data.telefono,
    sexo: data.sexo,
    centro: data.centros?.nombre ?? null,
    profesionalId: data.profesional_id,
    titularidad: data.titularidad,
  };
});

/** El rol de quien mira. Lo decide la base (`rol_actual()`), no una cookie ni una prop. */
export const cargarRol = cache(async () => {
  const sesion = await exigirSesion();
  return (await estadoDeCuenta(sesion))?.rol ?? null;
});

export type IndicadorDeRiesgo = { indicador: boolean; valoradoEn: string } | null;

/**
 * El indicador binario del técnico administrativo, y **solo suyo**: la vista
 * `pacientes_indicador_riesgo` filtra por `rol_actual() = 'tecnico_administrativo'` a
 * propósito, para que profesional y administrador sigan leyendo el nivel por la tabla, con
 * su política y su candado. Llamarla siendo otra cosa devuelve vacío, no un error.
 */
export const cargarIndicadorDeRiesgo = cache(async (id: string): Promise<IndicadorDeRiesgo> => {
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase
    .from('pacientes_indicador_riesgo')
    .select('indicador, valorado_en')
    .eq('paciente_id', id)
    .order('valorado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('cargarIndicadorDeRiesgo: fallo al leer el indicador', error);
    return null;
  }
  if (!data || data.indicador === null || data.valorado_en === null) return null;

  return { indicador: data.indicador, valoradoEn: data.valorado_en };
});

/**
 * ─── Corte B ──────────────────────────────────────────────────────────────────────────
 *
 * Las otras tres pestañas. Ninguna de estas tablas está bajo el candado del ADR-026 —lo dice
 * la propia migración: «representantes_paciente y consentimientos NO llevan candado: el
 * ADR-026 enumera las ocho tablas de contenido clínico que cubre, y estas no están»—, así que
 * se leen en el renderizado del servidor y **no** por la Server Action de apertura. Ese
 * camino es solo para lo que el candado tapa.
 *
 * Varias devuelven `null` para decir **«quien mira no puede leer esto»**, que no es lo mismo
 * que la lista vacía. La diferencia no es cosmética: RLS oculta filas sin dar error, así que
 * un `[]` sin distinguir haría que la pantalla le dijera «no hay ningún consentimiento» a
 * quien lo que le pasa es que no puede verlos. Por eso se decide **por rol antes de
 * consultar**, y no mirando el resultado.
 */

/**
 * Las citas de este paciente, por la puerta que corresponde a cada rol.
 *
 * El técnico administrativo **no tiene política de SELECT sobre `citas`** —es el invariante 3
 * y está puesto a propósito— y lee la vista `citas_agenda`, que es la misma agenda sin
 * `tipo_terapia_id` ni `nota_operativa` (choque 4). Preguntar por la tabla siendo técnico
 * devolvería vacío, y la pantalla diría que no hay citas.
 */
export const cargarCitasDelPaciente = cache(async (id: string): Promise<CitaDeVista[] | null> => {
  const { supabase } = await exigirSesion();
  const rol = await cargarRol();
  if (!rol) return null;

  const columnas = 'id, inicio, fin, estado, zona_horaria, sala';
  const { data, error } =
    rol === 'tecnico_administrativo'
      ? await supabase.from('citas_agenda').select(columnas).eq('paciente_id', id)
      : await supabase.from('citas').select(columnas).eq('paciente_id', id);

  if (error) {
    console.error('cargarCitasDelPaciente: fallo al leer las citas', error);
    return null;
  }

  // La vista deja sus columnas anulables porque es una vista. Una cita sin inicio, sin fin,
  // sin estado o sin zona no se puede pintar: se descarta aquí y no en el componente.
  return (data ?? []).flatMap((c) =>
    c.id && c.inicio && c.fin && c.estado && c.zona_horaria
      ? [
          {
            id: c.id,
            inicio: c.inicio,
            fin: c.fin,
            estado: c.estado,
            zonaHoraria: c.zona_horaria,
            sala: c.sala,
          },
        ]
      : [],
  );
});

/**
 * El nombre de un compañero sale **siempre** de `directorio_perfiles`, nunca de `perfiles`:
 * la tabla lleva `motivo_estado` —por qué alguien está suspendido o de baja— y eso no se
 * asoma a la ficha de un paciente.
 */
export const cargarNombreDeProfesional = cache(async (id: string): Promise<string | null> => {
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase
    .from('directorio_perfiles')
    .select('nombre_completo')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('cargarNombreDeProfesional: fallo al leer el directorio', error);
    return null;
  }
  return data?.nombre_completo ?? null;
});

export type RepresentanteDeVista = {
  id: string;
  nombre: string;
  apellidos: string;
  tipo: Database['public']['Enums']['tipo_representante'];
  alcance: Database['public']['Enums']['alcance_representacion'];
  telefono: string | null;
  correo: string | null;
  vigenteDesde: string;
  vigenteHasta: string | null;
};

/**
 * Las personas que pueden actuar por el paciente. `representantes_paciente.telefono` es **el
 * único teléfono de una persona en todo el esquema**: el paciente no tiene columna propia, y
 * por eso la ficha enseña este y lo dice en vez de dejar un hueco.
 *
 * El técnico administrativo no entra: la política es `administrador or es_profesional_asignado`.
 */
export const cargarRepresentantes = cache(
  async (id: string): Promise<RepresentanteDeVista[] | null> => {
    const { supabase } = await exigirSesion();
    const rol = await cargarRol();
    if (rol !== 'administrador' && rol !== 'profesional_sanitario') return null;

    const { data, error } = await supabase
      .from('representantes_paciente')
      .select(
        'id, nombre, apellidos, tipo, alcance, telefono, correo, vigente_desde, vigente_hasta',
      )
      .eq('paciente_id', id)
      .order('vigente_desde', { ascending: false });

    if (error) {
      console.error('cargarRepresentantes: fallo al leer los representantes', error);
      return null;
    }

    return (data ?? []).map((r) => ({
      id: r.id,
      nombre: r.nombre,
      apellidos: r.apellidos,
      tipo: r.tipo,
      alcance: r.alcance,
      telefono: r.telefono,
      correo: r.correo,
      vigenteDesde: r.vigente_desde,
      vigenteHasta: r.vigente_hasta,
    }));
  },
);

export type FirmanteDeVista = { id: string; nombreCompleto: string; firmadoEn: string | null };

export type ConsentimientoDeVista = {
  id: string;
  tipo: Database['public']['Enums']['tipo_consentimiento'];
  otorgadoEn: string | null;
  revocadoEn: string | null;
  menorOidoEn: string | null;
  textoVersion: string | null;
  textoFirmado: string | null;
  hayCopiaArchivada: boolean;
  firmantes: FirmanteDeVista[];
};

/**
 * Los consentimientos, con el texto **verbatim** que se firmó: el ADR-054 simplifica lo que
 * rodea al documento, jamás el documento. `documento_ruta` no sale de aquí —es una ruta de
 * Storage y la descarga es de otro ticket—: lo que se enseña es que existe copia.
 */
export const cargarConsentimientos = cache(
  async (id: string): Promise<ConsentimientoDeVista[] | null> => {
    const { supabase } = await exigirSesion();
    const rol = await cargarRol();
    if (rol !== 'administrador' && rol !== 'profesional_sanitario') return null;

    const [consentimientos, firmantes] = await Promise.all([
      supabase
        .from('consentimientos')
        .select(
          'id, tipo, otorgado_en, revocado_en, menor_oido_en, texto_version, texto_firmado, documento_ruta, creado_en',
        )
        .eq('paciente_id', id)
        .order('creado_en', { ascending: false }),
      supabase
        .from('consentimiento_firmantes')
        .select('id, consentimiento_id, nombre_completo, firmado_en')
        .eq('paciente_id', id),
    ]);

    if (consentimientos.error) {
      console.error('cargarConsentimientos: fallo al leerlos', consentimientos.error);
      return null;
    }
    // Los firmantes tienen política propia. Si fallan, el consentimiento se pinta sin ellos
    // en vez de desaparecer: quién firmó es un detalle del documento, no el documento.
    if (firmantes.error) {
      console.error('cargarConsentimientos: fallo al leer los firmantes', firmantes.error);
    }

    const porConsentimiento = new Map<string, FirmanteDeVista[]>();
    for (const f of firmantes.data ?? []) {
      const lista = porConsentimiento.get(f.consentimiento_id) ?? [];
      lista.push({ id: f.id, nombreCompleto: f.nombre_completo, firmadoEn: f.firmado_en });
      porConsentimiento.set(f.consentimiento_id, lista);
    }

    return (consentimientos.data ?? []).map((c) => ({
      id: c.id,
      tipo: c.tipo,
      otorgadoEn: c.otorgado_en,
      revocadoEn: c.revocado_en,
      menorOidoEn: c.menor_oido_en,
      textoVersion: c.texto_version,
      textoFirmado: c.texto_firmado,
      hayCopiaArchivada: c.documento_ruta !== null,
      firmantes: porConsentimiento.get(c.id) ?? [],
    }));
  },
);

export type AlertaDeVista = {
  id: string;
  tipo: Database['public']['Enums']['tipo_alerta_documentacion'];
  fechaReferencia: string | null;
  creadaEn: string;
};

/**
 * Lo que falta por firmar o por corregir. Esta tabla **sí** la lee el técnico administrativo,
 * acotada a sus centros, y es lo que mantiene «¿tenemos su consentimiento?» como pregunta de
 * recepción (choque 12) aunque el texto firmado no lo pueda abrir: la fila no lleva ni una
 * palabra clínica, solo identificadores y fechas.
 */
export const cargarAlertasDeDocumentacion = cache(
  async (id: string): Promise<AlertaDeVista[] | null> => {
    const { supabase } = await exigirSesion();

    const { data, error } = await supabase
      .from('alertas_documentacion')
      .select('id, tipo, fecha_referencia, creada_en')
      .eq('paciente_id', id)
      .eq('estado', 'abierta')
      .order('creada_en', { ascending: false });

    if (error) {
      console.error('cargarAlertasDeDocumentacion: fallo al leer las alertas', error);
      return null;
    }

    return (data ?? []).map((a) => ({
      id: a.id,
      tipo: a.tipo,
      fechaReferencia: a.fecha_referencia,
      creadaEn: a.creada_en,
    }));
  },
);

export type Legible<T> =
  | { estado: 'ok'; datos: T }
  | { estado: 'sin-datos' }
  | { estado: 'no-legible' };

export type DatosDeIdentificacion = { documento: string | null; domicilio: string | null };

/**
 * Documento y domicilio del paciente, descifrados. **Solo por `leer_identificacion()`,
 * nunca por un `select` a `pacientes_identificacion`** (ADR-060): el `select` directo
 * funcionaría igual de bien y no dejaría rastro en `auditoria`, que es exactamente el
 * fallo silencioso que esta función corrige. `null` es «no se pudo consultar»; los otros
 * dos estados distinguen «no hay fila» de «la fila no descifra» — confundirlos afirmaría
 * un hecho falso sobre el expediente, que es lo que el choque 5 prohíbe.
 */
export const cargarIdentificacion = cache(
  async (id: string): Promise<Legible<DatosDeIdentificacion> | null> => {
    const { supabase } = await exigirSesion();

    const { data, error } = await supabase.rpc('leer_identificacion', { p_paciente_id: id });

    if (error) {
      console.error('cargarIdentificacion: fallo al leer la identificación', error);
      return null;
    }

    const fila = data?.[0];
    if (!fila) return { estado: 'sin-datos' };

    try {
      const claro = await descifrarIdentificacion(fila as FilaIdentificacion);
      return {
        estado: 'ok',
        datos: { documento: claro.documento ?? null, domicilio: claro.domicilio ?? null },
      };
    } catch (errorDescifrado) {
      console.error('cargarIdentificacion: fallo al descifrar la fila', errorDescifrado);
      return { estado: 'no-legible' };
    }
  },
);

export type SaludBasicaDeVista = { alergias: string | null; medicacionActual: string | null };

/**
 * Alergias y medicación vigentes: la última fila del paciente, porque la tabla es de solo
 * adición (ADR-063). Las ve **solo el profesional asignado**, administrador incluido: el
 * técnico administrativo no entra por rol, y a quien no es el asignado se le pregunta a la
 * base con la misma función que usa la política. Sin esa pregunta, el cero de la RLS se
 * pintaría como «sin alergias registradas» sobre un paciente que las tiene. Su `null` hace
 * que el bloque de la ficha no se pinte en absoluto — ni en gris, ni «no tienes permiso»,
 * que ya diría que hay algo detrás.
 */
export const cargarSaludBasica = cache(
  async (id: string): Promise<SaludBasicaDeVista | null> => {
    const { supabase } = await exigirSesion();
    const rol = await cargarRol();
    if (rol !== 'administrador' && rol !== 'profesional_sanitario') return null;

    const { data: asignado, error: errorAsignado } = await supabase.rpc(
      'es_profesional_asignado',
      { p_paciente_id: id },
    );
    if (errorAsignado) {
      console.error('cargarSaludBasica: fallo al comprobar la asignación', errorAsignado);
      return null;
    }
    if (asignado !== true) return null;

    const { data, error } = await supabase
      .from('pacientes_salud_basica')
      .select('alergias, medicacion_actual')
      .eq('paciente_id', id)
      .order('registrado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('cargarSaludBasica: fallo al leer la salud básica', error);
      return null;
    }

    return {
      alergias: data?.alergias ?? null,
      medicacionActual: data?.medicacion_actual ?? null,
    };
  },
);
