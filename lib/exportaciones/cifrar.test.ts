// @vitest-environment node
// T-040 · `cifrarCopia` (diseño §1.3): ida y vuelta, NFC en los dos lados, datos asociados = la
// cabecera, límites de la contraseña y huella del fichero. Descifra por un camino independiente
// (Argon2id nativo de Node + WebCrypto), no con el propio código que cifra.
import * as crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { cifrarCopia, ErrorContrasena, type Derivar } from './cifrar';
import { CONTRASENA_MAX, CONTRASENA_MIN, KDF } from './constantes';
import { respuestaPacienteQueTraeDeMas, respuestaProfesional } from './fixtures-de-prueba';
import { proyectar } from './formato';

type Argon2Sync = (
  a: 'argon2id',
  p: { message: Uint8Array; nonce: Uint8Array; parallelism: number; tagLength: number; memory: number; passes: number },
) => Buffer;

function argon2Nativo(): Argon2Sync {
  const f = (crypto as unknown as { argon2Sync?: Argon2Sync }).argon2Sync;
  if (typeof f !== 'function') throw new Error(`crypto.argon2Sync no existe en Node ${process.version}`);
  return f;
}

const derivarNativo: Derivar = async (c, s, k) =>
  new Uint8Array(
    argon2Nativo()('argon2id', { message: c, nonce: s, parallelism: k.p, tagLength: k.longitud, memory: k.m, passes: k.t }),
  );

const utf8 = (s: string) => new TextEncoder().encode(s);

function partes(html: string) {
  const cabecera = /<script type="application\/json" id="cabecera">([^<]*)<\/script>/.exec(html)?.[1];
  const carga = /<script type="application\/json" id="carga">([^<]*)<\/script>/.exec(html)?.[1];
  if (cabecera === undefined || carga === undefined) throw new Error('fichero sin cabecera o sin carga');
  return { cabecera, carga: JSON.parse(carga) as string };
}

/** Descifra como el visor, pero con Argon2id nativo. `aad` permite probar una cabecera alterada. */
async function descifrar(html: string, contrasena: string, aad?: string): Promise<unknown> {
  const { cabecera, carga } = partes(html);
  const c = JSON.parse(cabecera) as { kdf: { m: number; t: number; p: number; longitud: number; sal: string }; nonce: string };
  const clave = argon2Nativo()('argon2id', {
    message: utf8(contrasena.normalize('NFC')),
    nonce: Buffer.from(c.kdf.sal, 'base64'),
    parallelism: c.kdf.p,
    tagLength: c.kdf.longitud,
    memory: c.kdf.m,
    passes: c.kdf.t,
  });
  const k = await crypto.webcrypto.subtle.importKey('raw', clave, 'AES-GCM', false, ['decrypt']);
  const claro = await crypto.webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(c.nonce, 'base64'), additionalData: utf8(aad ?? cabecera), tagLength: 128 },
    k,
    Buffer.from(carga, 'base64'),
  );
  return JSON.parse(new TextDecoder().decode(claro));
}

const CONTRASENA = 'una contraseña larga';

describe('cifrarCopia', () => {
  it('ida y vuelta: la carga descifrada es la copia, entera y en orden (C4)', async () => {
    const copia = proyectar(respuestaProfesional());
    const { html } = await cifrarCopia(copia, CONTRASENA, derivarNativo);
    expect(await descifrar(html, CONTRASENA)).toEqual(copia);
  });

  it('deriva con los parámetros de producción y la contraseña en NFC y UTF-8', async () => {
    const espia = vi.fn(derivarNativo);
    const nfd = 'contraseña de prueba'; // «ñ» descompuesta, como la teclea macOS
    await cifrarCopia(proyectar(respuestaProfesional()), nfd, espia);
    expect(espia).toHaveBeenCalledTimes(1);
    const [bytes, sal, kdf] = espia.mock.calls[0];
    expect(Buffer.from(bytes).toString('utf8')).toBe(nfd.normalize('NFC'));
    expect(sal).toHaveLength(16);
    expect(kdf).toEqual(KDF);
  });

  it('NFC en los dos lados: lo cifrado con la «ñ» descompuesta abre con la compuesta, y al revés', async () => {
    const copia = proyectar(respuestaProfesional());
    const nfd = 'contraseña de prueba';
    const nfc = 'contraseña de prueba';
    const a = await cifrarCopia(copia, nfd, derivarNativo);
    expect(await descifrar(a.html, nfc)).toEqual(copia);
    const b = await cifrarCopia(copia, nfc, derivarNativo);
    expect(await descifrar(b.html, nfd)).toEqual(copia);
  });

  it('la carga de una copia del paciente no contiene ninguna reservada (C2)', async () => {
    const copia = proyectar(respuestaPacienteQueTraeDeMas());
    const { html } = await cifrarCopia(copia, CONTRASENA, derivarNativo);
    const claro = JSON.stringify(await descifrar(html, CONTRASENA));
    expect(claro).not.toContain('MARCA-RESERVADA');
    expect(claro).not.toContain('MARCA-CUERPO-2');
    expect(claro).toContain('MARCA-CUERPO-1');
  });

  it('una contraseña errónea no abre', async () => {
    const { html } = await cifrarCopia(proyectar(respuestaProfesional()), CONTRASENA, derivarNativo);
    await expect(descifrar(html, CONTRASENA + 'x')).rejects.toThrow();
  });

  it('la cabecera son los datos asociados: cambiar solo un espacio impide abrir', async () => {
    const { html } = await cifrarCopia(proyectar(respuestaProfesional()), CONTRASENA, derivarNativo);
    const { cabecera } = partes(html);
    const conEspacio = cabecera.replace('","formato_version"', '", "formato_version"');
    expect(conEspacio).not.toBe(cabecera);
    expect(JSON.parse(conEspacio)).toEqual(JSON.parse(cabecera)); // mismos parámetros, mismos bytes de clave
    await expect(descifrar(html, CONTRASENA, conEspacio)).rejects.toThrow();
    await expect(descifrar(html, CONTRASENA, cabecera)).resolves.toBeTruthy();
  });

  it('fuera del cifrado no hay ningún dato de la copia', async () => {
    const copia = proyectar(respuestaProfesional());
    const { html } = await cifrarCopia(copia, CONTRASENA, derivarNativo);
    for (const dato of [
      copia.paciente.nombre,
      copia.paciente.apellidos,
      copia.paciente.id,
      copia.nota.id,
      copia.marca.codigo,
      copia.marca.quien,
      'MARCA-CUERPO',
      'MARCA-RESERVADA',
      copia.nota.fechaSesion,
      copia.proyeccionEtiqueta,
    ]) {
      expect(html, dato).not.toContain(dato);
    }
    expect(html).not.toContain(CONTRASENA);
  });

  it('sal y nonce salen del generador: 16 y 12 bytes, en ese orden', async () => {
    const pedidos: number[] = [];
    const aleatorio = (n: number) => {
      pedidos.push(n);
      return new Uint8Array(n).fill(7);
    };
    const { html } = await cifrarCopia(proyectar(respuestaProfesional()), CONTRASENA, derivarNativo, aleatorio);
    expect(pedidos).toEqual([16, 12]);
    const c = JSON.parse(partes(html).cabecera) as { kdf: { sal: string }; nonce: string };
    expect(c.kdf.sal).toBe(Buffer.alloc(16, 7).toString('base64'));
    expect(c.nonce).toBe(Buffer.alloc(12, 7).toString('base64'));
  });

  it('dos ficheros de la misma copia no comparten sal ni nonce', async () => {
    const copia = proyectar(respuestaProfesional());
    const a = partes((await cifrarCopia(copia, CONTRASENA, derivarNativo)).html).cabecera;
    const b = partes((await cifrarCopia(copia, CONTRASENA, derivarNativo)).html).cabecera;
    expect(a).not.toBe(b);
  });

  it('la huella es el SHA-256 del fichero en UTF-8, en hexadecimal', async () => {
    const { html, huellaHex } = await cifrarCopia(proyectar(respuestaProfesional()), CONTRASENA, derivarNativo);
    expect(huellaHex).toMatch(/^[0-9a-f]{64}$/);
    expect(huellaHex).toBe(crypto.createHash('sha256').update(html, 'utf8').digest('hex'));
  });

  it(`la contraseña mide de ${CONTRASENA_MIN} a ${CONTRASENA_MAX} caracteres tras NFC, sin derivar si no`, async () => {
    const copia = proyectar(respuestaProfesional());
    const espia = vi.fn(derivarNativo);
    await expect(cifrarCopia(copia, 'a'.repeat(CONTRASENA_MIN - 1), espia)).rejects.toBeInstanceOf(ErrorContrasena);
    await expect(cifrarCopia(copia, 'a'.repeat(CONTRASENA_MAX + 1), espia)).rejects.toBeInstanceOf(ErrorContrasena);
    // Once caracteres en NFC aunque sean doce puntos de código en NFD: no llega.
    await expect(cifrarCopia(copia, 'ñ'.repeat(1) + 'a'.repeat(10), espia)).rejects.toBeInstanceOf(ErrorContrasena);
    expect(espia).not.toHaveBeenCalled();
    await expect(cifrarCopia(copia, 'a'.repeat(CONTRASENA_MIN), espia)).resolves.toBeTruthy();
    await expect(cifrarCopia(copia, 'a'.repeat(CONTRASENA_MAX), espia)).resolves.toBeTruthy();
  });
});

describe('fichero de muestra para la comprobación manual (C7)', () => {
  it('escribe una copia de dos versiones en el directorio temporal del sistema', async () => {
    const copia = proyectar(respuestaProfesional());
    const { html, huellaHex } = await cifrarCopia(copia, 'muestra-de-T-040', derivarNativo);
    const ruta = path.join(os.tmpdir(), 'psicogestion-T-040-copia-de-muestra.html');
    writeFileSync(ruta, html, 'utf8');
    console.info(`[T-040] muestra: ${ruta} · contraseña: muestra-de-T-040 · huella: ${huellaHex}`);
    expect(await descifrar(html, 'muestra-de-T-040')).toEqual(copia);
  });
});
