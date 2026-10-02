// @vitest-environment node
// T-040 · `esquemaRespuestaExportar` (§1.2 + `exportada_por`) y `proyectar` (§1.3): la proyección
// pura que vuelve a recortar lo que la base no debía entregar (D9, defensa en profundidad).
import { describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n';

import { ALGORITMO, FORMATO, FORMATO_VERSION, KDF, MOTIVOS } from './constantes';
import {
  H,
  ID_EXPORTACION,
  respuestaPacienteQueTraeDeMas,
  respuestaProfesional,
  sello,
} from './fixtures-de-prueba';
import { esquemaCopiaV1, esquemaRespuestaExportar, proyectar } from './formato';

describe('esquemaRespuestaExportar', () => {
  it('acepta la respuesta del §1.2 con `exportada_por`', () => {
    expect(esquemaRespuestaExportar.safeParse(respuestaProfesional()).success).toBe(true);
    expect(esquemaRespuestaExportar.safeParse(respuestaPacienteQueTraeDeMas()).success).toBe(true);
  });

  it('exige `exportada_por` (la marca de agua sale de ahí)', () => {
    const sin: Record<string, unknown> = { ...respuestaProfesional() };
    delete sin.exportada_por;
    expect(esquemaRespuestaExportar.safeParse(sin).success).toBe(false);
    const sinNombre = { ...respuestaProfesional(), exportada_por: { nombre: '', apellidos: 'X', rol: 'administrador' } };
    expect(esquemaRespuestaExportar.safeParse(sinNombre).success).toBe(false);
    const otroRol = {
      ...respuestaProfesional(),
      exportada_por: { nombre: 'T', apellidos: '', rol: 'tecnico_administrativo' },
    };
    expect(esquemaRespuestaExportar.safeParse(otroRol).success).toBe(false);
  });

  it('valida `cifrado` con literales iguales a constantes.ts: si la base discrepa, no hay copia', () => {
    for (const cifrado of [
      { ...respuestaProfesional().cifrado, formato_version: 2 },
      { ...respuestaProfesional().cifrado, algoritmo: 'argon2id-aes-128-gcm' },
      { ...respuestaProfesional().cifrado, kdf: { m: 4096, t: 3, p: 1, longitud: 32 } },
      { ...respuestaProfesional().cifrado, kdf: { m: 65536, t: 1, p: 1, longitud: 32 } },
      { ...respuestaProfesional().cifrado, kdf: { m: 65536, t: 3, p: 4, longitud: 32 } },
    ]) {
      expect(esquemaRespuestaExportar.safeParse({ ...respuestaProfesional(), cifrado }).success).toBe(false);
    }
    // Y los literales del esquema son los de constantes.ts (el banco 24 §A fija los mismos en SQL).
    expect([FORMATO_VERSION, ALGORITMO, KDF]).toEqual([1, 'argon2id-aes-256-gcm', { m: 65536, t: 3, p: 1, longitud: 32 }]);
    expect(MOTIVOS).toEqual(['peticion_paciente', 'requerimiento_judicial_o_inspeccion', 'traspaso_caso']);
  });

  it('rechaza una zona que no es IANA y una proyección incoherente con el motivo', () => {
    expect(esquemaRespuestaExportar.safeParse({ ...respuestaProfesional(), zona: 'CET' }).success).toBe(false);
    expect(
      esquemaRespuestaExportar.safeParse({ ...respuestaProfesional(), proyeccion: 'paciente' }).success,
    ).toBe(false);
    expect(
      esquemaRespuestaExportar.safeParse({
        ...respuestaPacienteQueTraeDeMas(),
        proyeccion: 'profesional',
      }).success,
    ).toBe(false);
    expect(
      esquemaRespuestaExportar.safeParse({ ...respuestaProfesional(), referencia: 'sin motivo' }).success,
    ).toBe(false);
  });

  it('rechaza versiones fuera de orden, una huella mal formada y una lista vacía', () => {
    const r = respuestaProfesional();
    expect(
      esquemaRespuestaExportar.safeParse({ ...r, versiones: [...r.versiones].reverse() }).success,
    ).toBe(false);
    expect(
      esquemaRespuestaExportar.safeParse({ ...r, versiones: [{ ...r.versiones[0], huella: 'AB' }] }).success,
    ).toBe(false);
    expect(esquemaRespuestaExportar.safeParse({ ...r, versiones: [] }).success).toBe(false);
  });
});

describe('proyectar · la copia profesional', () => {
  const copia = proyectar(respuestaProfesional());

  it('cumple esquemaCopiaV1 y lleva el formato', () => {
    expect(esquemaCopiaV1.safeParse(copia).success).toBe(true);
    expect(copia.formato).toBe(FORMATO);
    expect(copia.formato_version).toBe(FORMATO_VERSION);
  });

  it('arma la marca de agua desde la respuesta: código, quién, rol, fecha en la zona y motivo', () => {
    expect(copia.marca).toEqual({
      codigo: ID_EXPORTACION,
      quien: 'Ana Martín',
      rol: t('roles.profesionalSanitario'),
      fecha: '02/10/2026 10:15',
      motivo: t('exportaciones.marca.copiaProfesional'),
    });
  });

  it('conserva el orden, el número real y las huellas en hexadecimal', () => {
    expect(copia.versiones.map((v) => v.numero)).toEqual([1, 3]);
    expect(copia.versiones.map((v) => [v.huella, v.huellaAnterior])).toEqual([
      [H('a'), H('0')],
      [H('b'), H('c')],
    ]);
  });

  it('lleva el texto, las reservadas, el canónico literal y la fórmula', () => {
    const [v1, v2] = copia.versiones;
    expect(v1.texto).toBe('MARCA-CUERPO-1');
    expect(v1.reservadas).toBe('MARCA-RESERVADA-1');
    expect(v1.contenidoCanonico).toBe('{"anotaciones_reservadas":"MARCA-RESERVADA-1"}');
    expect(v2.motivoCambio).toBe('MARCA-MOTIVO-2');
    expect(v2.texto).toBe('MARCA-CUERPO-2');
    expect(copia.formula).toBe(t('exportaciones.copia.formula'));
    expect(v1.participantes).toBeUndefined();
  });

  it('formatea en la zona: fecha de sesión sin pasar por Date, firma y frase del sello', () => {
    expect(copia.nota.fechaSesion).toBe('10/03/2026');
    expect(copia.nota.modalidad).toBe(t('notas.modalidad.individual'));
    expect(copia.versiones[0].firmadaEn).toBe('10/03/2026 10:50');
    expect(copia.versiones[0].sello).toBe('Escrita durante la sesión del 10/03 · 10:00–10:50');
    expect(copia.generadaEn).toBe('02/10/2026 10:15');
  });

  it('un sello nulo o de otra era es «ilegible», nunca «fuera de sesión»', () => {
    const r = respuestaProfesional();
    r.versiones[0].sello = null;
    r.versiones[1].sello = sello({ esquema_version: 3 });
    const c = proyectar(r);
    expect(c.versiones.map((v) => v.sello)).toEqual([t('notas.sello.ilegible'), t('notas.sello.ilegible')]);
  });

  it('un cuerpo ilegible da texto vacío, y unas reservadas vacías son null', () => {
    const r = respuestaProfesional();
    r.versiones[0].cuerpo = 'no es json';
    r.versiones[0].anotaciones_reservadas = '';
    const c = proyectar(r);
    expect(c.versiones[0].texto).toBe('');
    expect(c.versiones[0].reservadas).toBeNull();
  });

  it('no lleva posicion_cadena ni ids de perfiles', () => {
    const json = JSON.stringify(copia);
    expect(json).not.toContain('posicion_cadena');
    expect(json).not.toContain('autor_id');
  });
});

describe('proyectar · la copia del paciente vuelve a recortar aunque la base entregue de más (D9)', () => {
  const copia = proyectar(respuestaPacienteQueTraeDeMas());
  const json = JSON.stringify(copia);

  it('no contiene ninguna reservada ni el canónico (que las contiene)', () => {
    expect(json).not.toContain('MARCA-RESERVADA');
    expect(copia.versiones.every((v) => !('reservadas' in v))).toBe(true);
    expect(copia.versiones.every((v) => !('contenidoCanonico' in v))).toBe(true);
    expect(copia.formula).toBeUndefined();
  });

  it('de la conjunta quita el cuerpo y el motivo del cambio, y entrega los asistentes', () => {
    const [v1, v2] = copia.versiones;
    expect(v1.texto).toBe('MARCA-CUERPO-1');
    expect(v1.participantes).toBeUndefined();
    expect(json).not.toContain('MARCA-CUERPO-2');
    expect(json).not.toContain('MARCA-MOTIVO-2');
    expect('texto' in v2).toBe(false);
    expect('motivoCambio' in v2).toBe(false);
    expect(v2.participantes).toEqual([{ nombre: 'Luis Pérez', papel: 'pareja' }]);
  });

  it('conserva el orden, el número real y las huellas', () => {
    expect(copia.versiones.map((v) => [v.numero, v.huella, v.huellaAnterior])).toEqual([
      [1, H('a'), H('0')],
      [3, H('b'), H('c')],
    ]);
  });

  it('lleva la marca del administrador con el motivo, y los avisos de exclusión y de conjunta', () => {
    expect(copia.marca).toEqual({
      codigo: ID_EXPORTACION,
      quien: 'Berta Ruiz',
      rol: t('roles.administrador'),
      fecha: '02/10/2026 10:15',
      motivo: t('exportaciones.copia.motivos.peticion_paciente'),
    });
    expect(copia.avisos).toContain(t('exportaciones.copia.exclusion'));
    expect(copia.avisos).toContain(t('exportaciones.copia.conjunta'));
    expect(copia.referencia).toBe('Solicitud por escrito 2026/14');
    expect(esquemaCopiaV1.safeParse(copia).success).toBe(true);
  });

  it('`apellidos` vacío no deja un espacio colgando en `quien`', () => {
    const r = respuestaPacienteQueTraeDeMas();
    r.exportada_por = { nombre: 'Berta Ruiz', apellidos: '', rol: 'administrador' };
    expect(proyectar(r).marca.quien).toBe('Berta Ruiz');
  });
});
