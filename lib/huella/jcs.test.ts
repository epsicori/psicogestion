import { describe, expect, it } from 'vitest';

import { canonizar, canonizarABytes, ErrorCanonicalizacion, type ValorJson } from './jcs';

describe('canonizar · conformidad JCS (RFC 8785)', () => {
  it('ordena las claves por unidades de código UTF-16', () => {
    expect(canonizar({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    // ASCII antes que no-ASCII, y "A" (0x41) antes que "a" (0x61) antes que "á" (0xe1).
    expect(canonizar({ á: 1, a: 2, A: 3 })).toBe('{"A":3,"a":2,"á":1}');
  });

  it('objetos y arrays vacíos', () => {
    expect(canonizar({})).toBe('{}');
    expect(canonizar([])).toBe('[]');
  });

  it('anidamiento de objetos y arrays', () => {
    expect(canonizar({ a: [1, { z: 1, y: 2 }, null] })).toBe('{"a":[1,{"y":2,"z":1},null]}');
  });

  it('true, false y null', () => {
    expect(canonizar(true)).toBe('true');
    expect(canonizar(false)).toBe('false');
    expect(canonizar(null)).toBe('null');
  });

  it('el mismo objeto con las claves en otro orden produce el mismo canónico', () => {
    const a = canonizar({ uno: 1, dos: 2, tres: 3 });
    const b = canonizar({ tres: 3, uno: 1, dos: 2 });
    expect(a).toBe(b);
  });

  it('escapa U+0000 a U+001F: las siete formas cortas, el resto como \\u00XX', () => {
    const cortas: Record<string, string> = {
      '\b': '\\b',
      '\t': '\\t',
      '\n': '\\n',
      '\f': '\\f',
      '\r': '\\r',
      '"': '\\"',
      '\\': '\\\\',
    };
    for (const [caracter, esperado] of Object.entries(cortas)) {
      expect(canonizar(caracter)).toBe(`"${esperado}"`);
    }
    for (let codigo = 0; codigo <= 0x1f; codigo++) {
      const caracter = String.fromCharCode(codigo);
      if (caracter in cortas) continue;
      const esperado = `\\u${codigo.toString(16).padStart(4, '0')}`;
      expect(canonizar(caracter)).toBe(`"${esperado}"`);
    }
  });

  it('U+0000 nunca sale como byte nulo crudo en la salida canónica', () => {
    const salida = canonizar('a\u0000b');
    expect(salida).not.toContain('\u0000');
    expect(salida).toBe('"a\\u0000b"');
    const bytes = canonizarABytes('a\u0000b');
    expect(Array.from(bytes)).not.toContain(0);
  });

  it('canonizarABytes produce UTF-8 del mismo texto que canonizar', () => {
    const bytes = canonizarABytes({ a: 'á' });
    expect(new TextDecoder().decode(bytes)).toBe(canonizar({ a: 'á' }));
  });
});

describe('canonizar · casos feos a propósito', () => {
  it('acentos: NFD y NFC visualmente iguales dan canónicos distintos SI NO se normaliza antes (lo hace nfc.ts)', () => {
    const nfd = 'e' + '́'; // "é" descompuesta (e + acento agudo combinante)
    const nfc = 'é'; // "é" precompuesta
    expect(nfd).not.toBe(nfc);
    // jcs.ts no normaliza: es responsabilidad de normalizarNfc(), llamado antes.
    expect(canonizar(nfd)).not.toBe(canonizar(nfc));
  });

  it('emoji fuera del BMP (par sustituto) y con selector de variación', () => {
    const emoji = '\u{1f600}'; // 😀, par sustituto en UTF-16
    expect(canonizar(emoji)).toBe(JSON.stringify(emoji));
    const conVariante = '❤️'; // ❤️: corazón + selector de variación
    expect(canonizar(conVariante)).toBe(JSON.stringify(conVariante));
  });

  it('comillas tipográficas y guion largo (texto pegado desde Word)', () => {
    const texto = '“Hola” — ‘cita’';
    expect(canonizar(texto)).toBe(JSON.stringify(texto));
  });

  it('espacio duro (non-breaking space)', () => {
    const texto = 'a b';
    expect(canonizar(texto)).toBe(JSON.stringify(texto));
  });

  it('claves en otro orden producen el mismo canónico', () => {
    expect(canonizar({ x: 1, y: 2, z: 3 })).toBe(canonizar({ z: 3, x: 1, y: 2 }));
  });

  it('enteros en notación exponencial en el origen JSON salen como dígitos planos', () => {
    // `1e2` como literal JSON se convierte en el número 100 al hacer JSON.parse;
    // desde ese punto es indistinguible de haber escrito `100`.
    const valor = JSON.parse('{"n":1e2}') as ValorJson;
    expect(canonizar(valor)).toBe('{"n":100}');
  });

  it('cadena vacía', () => {
    expect(canonizar('')).toBe('""');
  });
});

describe('canonizar · rechazos', () => {
  const rutaDe = (fn: () => void): string => {
    try {
      fn();
    } catch (e) {
      if (e instanceof ErrorCanonicalizacion) return e.ruta;
      throw e;
    }
    throw new Error('no lanzó');
  };

  it('undefined no es JSON', () => {
    expect(() => canonizar(undefined as unknown as ValorJson)).toThrow(ErrorCanonicalizacion);
  });

  it('función, symbol y bigint no son JSON', () => {
    expect(() => canonizar((() => {}) as unknown as ValorJson)).toThrow(ErrorCanonicalizacion);
    expect(() => canonizar(Symbol('x') as unknown as ValorJson)).toThrow(ErrorCanonicalizacion);
    expect(() => canonizar(BigInt(10) as unknown as ValorJson)).toThrow(ErrorCanonicalizacion);
  });

  it('Date, Map y Set no son objetos planos', () => {
    expect(() => canonizar(new Date() as unknown as ValorJson)).toThrow(ErrorCanonicalizacion);
    expect(() => canonizar(new Map() as unknown as ValorJson)).toThrow(ErrorCanonicalizacion);
    expect(() => canonizar(new Set() as unknown as ValorJson)).toThrow(ErrorCanonicalizacion);
  });

  it('NaN e Infinity no son JSON', () => {
    expect(() => canonizar(NaN)).toThrow(ErrorCanonicalizacion);
    expect(() => canonizar(Infinity)).toThrow(ErrorCanonicalizacion);
    expect(() => canonizar(-Infinity)).toThrow(ErrorCanonicalizacion);
  });

  it('un decimal no es un entero seguro', () => {
    expect(() => canonizar(1.5)).toThrow(ErrorCanonicalizacion);
  });

  it('un entero fuera de Number.isSafeInteger se rechaza', () => {
    expect(() => canonizar(9007199254740993)).toThrow(ErrorCanonicalizacion);
    expect(Number.isSafeInteger(9007199254740993)).toBe(false);
  });

  it('un sustituto UTF-16 suelto no es Unicode válido', () => {
    const sueltoAlto = '\ud83d'; // mitad alta de 😀 sin su pareja
    const sueltoBajo = '\ude00'; // mitad baja sin su pareja
    expect(() => canonizar(sueltoAlto)).toThrow(ErrorCanonicalizacion);
    expect(() => canonizar(sueltoBajo)).toThrow(ErrorCanonicalizacion);
  });

  it('el mensaje de rechazo lleva la ruta del nodo culpable', () => {
    const ruta = rutaDe(() => canonizar({ cuerpo: { content: [{}, { attrs: { level: 1.5 } }] } }));
    expect(ruta).toBe('$.cuerpo.content[1].attrs.level');
  });
});
