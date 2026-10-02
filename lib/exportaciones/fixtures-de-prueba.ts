// T-040 · Respuestas de `exportar_nota` para las pruebas de `lib/exportaciones` (solo pruebas).
// Llevan las marcas del banco 24 (§3): si una aparece donde no debe, la prueba la encuentra.
import { ALGORITMO } from './constantes';
import type { RespuestaExportar } from './formato';

export const H = (c: string) => c.repeat(64);
export const ID_EXPORTACION = '0b6f3f0e-6c1a-4d3e-9b1a-1f2e3d4c5b6a';
export const ID_PACIENTE = '7a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
export const ID_NOTA = '5c4b3a29-1807-4f6e-9d5c-4b3a29180700';
const ID_CITA = '11111111-2222-4333-8444-555555555555';

export function sello(o: Partial<Record<string, unknown>> = {}) {
  return {
    esquema_version: 4,
    cita_id: ID_CITA,
    abierta_en: '2026-03-10T09:00:00.000Z',
    firmada_en: '2026-03-10T09:50:00.000Z',
    redactada_en_sesion: true,
    margen_sesion_minutos: 10,
    fecha_sesion: '2026-03-10',
    ...o,
  };
}

/** La proyección profesional de una nota con una versión individual (v1) y una conjunta (v3). */
export function respuestaProfesional(): RespuestaExportar {
  return {
    exportacion_id: ID_EXPORTACION,
    proyeccion: 'profesional',
    motivo: null,
    referencia: null,
    generada_en: '2026-10-02T08:15:00.123456+00:00',
    zona: 'Europe/Madrid',
    cifrado: { formato_version: 1, algoritmo: ALGORITMO, kdf: { m: 65536, t: 3, p: 1, longitud: 32 } },
    paciente: { id: ID_PACIENTE, nombre: 'Lucía', apellidos: 'Pérez Gómez' },
    nota: { id: ID_NOTA, fecha_sesion: '2026-03-10', modalidad: 'individual' },
    exportada_por: { nombre_completo: 'Ana Martín', rol: 'profesional_sanitario' },
    versiones: [
      {
        numero_version: 1,
        alcance: 'individual',
        autor_nombre: 'Ana Martín',
        creada_en: '2026-03-10T09:50:00+00:00',
        huella: H('a'),
        huella_anterior: H('0'),
        sello: sello(),
        motivo_cambio: null,
        cuerpo: JSON.stringify({ texto: 'MARCA-CUERPO-1' }),
        anotaciones_reservadas: 'MARCA-RESERVADA-1',
        contenido_canonico: '{"anotaciones_reservadas":"MARCA-RESERVADA-1"}',
      },
      {
        numero_version: 3,
        alcance: 'conjunta',
        autor_nombre: 'Ana Martín',
        creada_en: '2026-03-12T17:05:00+00:00',
        huella: H('b'),
        huella_anterior: H('c'),
        sello: sello({ firmada_en: '2026-03-12T17:05:00.000Z', redactada_en_sesion: false }),
        motivo_cambio: 'MARCA-MOTIVO-2',
        cuerpo: JSON.stringify({ texto: 'MARCA-CUERPO-2' }),
        anotaciones_reservadas: 'MARCA-RESERVADA-2',
        contenido_canonico: '{"anotaciones_reservadas":"MARCA-RESERVADA-2"}',
      },
    ],
  };
}

/**
 * La misma nota pedida por el administrador con «petición del paciente», pero con una base
 * que (por un fallo) entrega TODO: `proyectar` tiene que recortarlo igual.
 */
export function respuestaPacienteQueTraeDeMas(): RespuestaExportar {
  const r = respuestaProfesional();
  return {
    ...r,
    proyeccion: 'paciente',
    motivo: 'peticion_paciente',
    referencia: 'Solicitud por escrito 2026/14',
    exportada_por: { nombre_completo: 'Berta Ruiz', rol: 'administrador' },
    versiones: r.versiones.map((v) => ({
      ...v,
      participantes: [{ nombre: 'Luis', apellidos: 'Pérez', papel: 'pareja' }],
    })),
  };
}

/**
 * Lo que la base entrega de verdad en la proyección del paciente (§1.2): la individual con
 * cuerpo y motivo del cambio; la conjunta solo con participantes.
 */
export function respuestaPacienteMinima(): RespuestaExportar {
  const r = respuestaPacienteQueTraeDeMas();
  const [v1, v3] = r.versiones;
  return {
    ...r,
    versiones: [
      {
        numero_version: v1.numero_version,
        alcance: v1.alcance,
        autor_nombre: v1.autor_nombre,
        creada_en: v1.creada_en,
        huella: v1.huella,
        huella_anterior: v1.huella_anterior,
        sello: v1.sello,
        motivo_cambio: v1.motivo_cambio,
        cuerpo: v1.cuerpo,
      },
      {
        numero_version: v3.numero_version,
        alcance: v3.alcance,
        autor_nombre: v3.autor_nombre,
        creada_en: v3.creada_en,
        huella: v3.huella,
        huella_anterior: v3.huella_anterior,
        sello: v3.sello,
        participantes: [{ nombre: 'Luis', apellidos: 'Pérez', papel: 'pareja' }],
      },
    ],
  };
}
