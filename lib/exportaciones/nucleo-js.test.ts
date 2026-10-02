// @vitest-environment node
// T-040 · El núcleo criptográfico del visor (BLAKE2b + Argon2id en JavaScript plano) se coteja
// byte a byte con el Argon2id nativo de Node. Si `crypto.argon2Sync` no existe (Node < 24.7),
// estas pruebas FALLAN con ese motivo: no se saltan (diseño §3, «Vitest, núcleo»).
import * as crypto from 'node:crypto';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { KDF } from './constantes';
import { NUCLEO_JS, scriptDelNucleo } from './nucleo-js';

type Argon2Sync = (
  algoritmo: 'argon2id',
  parametros: {
    message: Uint8Array | string;
    nonce: Uint8Array;
    parallelism: number;
    tagLength: number;
    memory: number;
    passes: number;
  },
) => Buffer;

interface Nucleo {
  argon2id: (
    contrasena: Uint8Array,
    sal: Uint8Array,
    k: { m: number; t: number; p: number; longitud: number },
  ) => Uint8Array;
  blake2b: (entrada: Uint8Array, longitud?: number) => Uint8Array;
}

/** Ejecuta el núcleo como lo hace el fichero: la cadena, tal cual, en un contexto aparte. */
function cargarNucleo(): Nucleo {
  const contexto: { Nucleo?: Nucleo } = { };
  vm.runInNewContext(scriptDelNucleo(), contexto);
  if (!contexto.Nucleo) throw new Error('scriptDelNucleo no define Nucleo');
  return contexto.Nucleo;
}

function oraculo(): Argon2Sync {
  const nativo = (crypto as unknown as { argon2Sync?: Argon2Sync }).argon2Sync;
  if (typeof nativo !== 'function') {
    throw new Error(
      `crypto.argon2Sync no existe en Node ${process.version}: hace falta Node 24.7 o posterior. ` +
        'Esta prueba no se salta.',
    );
  }
  return nativo;
}

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const utf8 = (s: string) => new TextEncoder().encode(s);

describe('NUCLEO_JS · BLAKE2b (RFC 7693)', () => {
  const nucleo = cargarNucleo();

  it('BLAKE2b-512 de "abc" es el del apéndice A del RFC 7693', () => {
    expect(hex(nucleo.blake2b(utf8('abc')))).toBe(
      'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d1' +
        '7d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923',
    );
  });

  it('BLAKE2b-512 de la cadena vacía', () => {
    expect(hex(nucleo.blake2b(new Uint8Array(0)))).toBe(
      '786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419' +
        'd25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce',
    );
  });

  it('coincide con blake2b512 de Node en entradas que cruzan el bloque de 128 bytes', () => {
    for (const n of [1, 63, 127, 128, 129, 255, 256, 1000, 1024 + 4]) {
      const entrada = new Uint8Array(n).map((_, i) => (i * 31 + n) & 0xff);
      const esperado = crypto.createHash('blake2b512').update(entrada).digest('hex');
      expect(hex(nucleo.blake2b(entrada)), `n = ${n}`).toBe(esperado);
    }
  });
});

describe('NUCLEO_JS · Argon2id (RFC 9106) contra crypto.argon2Sync de Node', () => {
  const nucleo = cargarNucleo();

  it('crypto.argon2Sync existe en este Node (si no, la prueba falla, no se salta)', () => {
    expect(typeof oraculo()).toBe('function');
  });

  const casos: { nombre: string; contrasena: string; sal: Uint8Array; m: number; t: number }[] = [
    {
      nombre: 'los parámetros de producción (m = 65536, t = 3)',
      contrasena: 'una contraseña larga de prueba',
      sal: new Uint8Array(16).map((_, i) => i * 7 + 1),
      m: KDF.m,
      t: KDF.t,
    },
    {
      nombre: 'el mínimo (m = 8, t = 1)',
      contrasena: 'password',
      sal: new Uint8Array(16).fill(2),
      m: 8,
      t: 1,
    },
    {
      nombre: 't = 4',
      contrasena: 'cuatro pasadas',
      sal: new Uint8Array(16).map((_, i) => 255 - i),
      m: 1024,
      t: 4,
    },
    {
      nombre: 'una contraseña con «ñ» y emoji',
      contrasena: 'contraseña con ñ y 🔐 y más',
      sal: new Uint8Array(16).map((_, i) => (i * 13) & 0xff),
      m: 256,
      t: 2,
    },
    {
      nombre: 'la sal de todo ceros',
      contrasena: 'sal a cero',
      sal: new Uint8Array(16),
      m: 64,
      t: 3,
    },
    // B-H2: un m que no es múltiplo de 4 (m′ = 4·⌊m/4⌋ en la memoria; m, no m′, en H0) y sales
    // de otro largo (H0 lleva el largo real de la sal, no un 16 fijo).
    {
      nombre: 'm = 10 y una sal de 8 bytes (la mínima)',
      contrasena: 'diez kibibytes',
      sal: new Uint8Array(8).map((_, i) => i + 40),
      m: 10,
      t: 1,
    },
    {
      nombre: 'm = 4099 y una sal de 300 bytes',
      contrasena: 'cuatro mil noventa y nueve',
      sal: new Uint8Array(300).map((_, i) => (i * 37 + 11) & 0xff),
      m: 4099,
      t: 1,
    },
    {
      nombre: 'm = 1027, t = 2 y una sal de 32 bytes',
      contrasena: 'mil veintisiete',
      sal: new Uint8Array(32).map((_, i) => (i * 5) & 0xff),
      m: 1027,
      t: 2,
    },
  ];

  for (const caso of casos) {
    it(`coincide byte a byte: ${caso.nombre}`, () => {
      const contrasena = utf8(caso.contrasena);
      const esperado = oraculo()('argon2id', {
        message: contrasena,
        nonce: caso.sal,
        parallelism: 1,
        tagLength: 32,
        memory: caso.m,
        passes: caso.t,
      });
      const obtenido = nucleo.argon2id(contrasena, caso.sal, {
        m: caso.m,
        t: caso.t,
        p: 1,
        longitud: 32,
      });
      expect(Object.prototype.toString.call(obtenido)).toBe('[object Uint8Array]');
      expect(hex(obtenido)).toBe(esperado.toString('hex'));
    }, 120_000);
  }

  it('una clave de 64 bytes también coincide (H′ con más de un bloque)', () => {
    const esperado = oraculo()('argon2id', {
      message: utf8('salida larga'),
      nonce: new Uint8Array(16).fill(9),
      parallelism: 1,
      tagLength: 64,
      memory: 32,
      passes: 1,
    });
    const obtenido = nucleo.argon2id(utf8('salida larga'), new Uint8Array(16).fill(9), {
      m: 32,
      t: 1,
      p: 1,
      longitud: 64,
    });
    expect(hex(obtenido)).toBe(esperado.toString('hex'));
  });

  // B-H3: sin pasadas, la clave sería la misma para cualquier contraseña y sal.
  it('lanza con t, m, longitud o sal fuera de rango, sin derivar nada', () => {
    const base = { m: 64, t: 1, p: 1, longitud: 32 };
    const sal = new Uint8Array(16);
    for (const k of [
      { ...base, t: 0 },
      { ...base, t: 65 },
      { ...base, t: 1.5 },
      { ...base, m: 7 },
      { ...base, m: 4194305 },
      { ...base, m: 64.5 },
      { ...base, longitud: 3 },
      { ...base, longitud: 1025 },
    ]) {
      expect(() => nucleo.argon2id(utf8('x'), sal, k), JSON.stringify(k)).toThrow();
    }
    expect(() => nucleo.argon2id(utf8('x'), new Uint8Array(7), base)).toThrow();
  });

  it('p = 2 lanza: el núcleo solo admite una vía (D14)', () => {
    expect(() =>
      nucleo.argon2id(utf8('x'), new Uint8Array(16), { m: 64, t: 1, p: 2, longitud: 32 }),
    ).toThrow();
  });
});

describe('NUCLEO_JS · es una cadena de JavaScript plano', () => {
  it('es una cadena y scriptDelNucleo la envuelve en `var Nucleo`', () => {
    expect(typeof NUCLEO_JS).toBe('string');
    expect(scriptDelNucleo()).toBe('var Nucleo = (function(){' + NUCLEO_JS + '})();');
  });

  it('termina devolviendo argon2id y blake2b', () => {
    expect(NUCLEO_JS.trim().endsWith('return { argon2id: argon2id, blake2b: blake2b };')).toBe(true);
  });

  it('no usa sintaxis posterior a ES2017 ni la que un compilador bajaría con ayudantes', () => {
    for (const prohibido of [
      /\bclass\s/,
      /\basync\b/,
      /\bawait\b/,
      /function\s*\*/,
      /\byield\b/,
      /\?\./,
      /\?\?/,
      /\bimport\b/,
      /\bexport\b/,
      /\bBigInt\b/,
      /\d+n\b/,
      /\beval\b/,
      /new\s+Function/,
      /<\/script/i,
    ]) {
      expect(NUCLEO_JS, String(prohibido)).not.toMatch(prohibido);
    }
  });
});
