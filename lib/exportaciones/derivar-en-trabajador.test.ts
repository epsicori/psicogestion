// T-040 · `derivarEnTrabajador` (diseño §1.3, D3): el núcleo corre en un Worker creado desde un
// Blob. El Worker falso ejecuta DE VERDAD el script del Blob en un contexto aparte (vm), así que se
// prueba el pegamento real; y en los dos caminos se termina el Worker y se revoca la URL.
import * as crypto from 'node:crypto';
import vm from 'node:vm';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KDF } from './constantes';
import { derivarEnTrabajador } from './derivar-en-trabajador';

type Argon2Sync = (
  a: 'argon2id',
  p: { message: Uint8Array; nonce: Uint8Array; parallelism: number; tagLength: number; memory: number; passes: number },
) => Buffer;

let scripts: Map<string, Blob>;
let trabajadores: TrabajadorFalso[];
let revocadas: string[];
let romper = false;

class TrabajadorFalso {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  terminado = false;
  private ambito: Record<string, unknown> | null = null;

  constructor(readonly url: string) {
    trabajadores.push(this);
  }

  postMessage(datos: unknown) {
    const blob = scripts.get(this.url);
    if (!blob) throw new Error('Worker sin Blob');
    void blob.text().then((codigo) => {
      if (romper) {
        this.onerror?.({ message: 'fallo simulado' });
        return;
      }
      const ambito: Record<string, unknown> = {
        Uint8Array,
        Uint32Array,
        Math,
        Error,
        postMessage: (respuesta: unknown) => setTimeout(() => this.onmessage?.({ data: respuesta }), 0),
      };
      ambito.self = ambito;
      this.ambito = ambito;
      vm.runInNewContext(codigo, ambito);
      const manejador = ambito.onmessage as ((e: { data: unknown }) => void) | undefined;
      if (typeof manejador !== 'function') throw new Error('el script no define onmessage');
      manejador({ data: datos });
    });
  }

  terminate() {
    this.terminado = true;
    this.ambito = null;
  }
}

beforeEach(() => {
  scripts = new Map();
  trabajadores = [];
  revocadas = [];
  romper = false;
  let n = 0;
  vi.stubGlobal('Worker', TrabajadorFalso);
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
    const url = `blob:prueba/${++n}`;
    scripts.set(url, b as Blob);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => {
    revocadas.push(u);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('derivarEnTrabajador', () => {
  it('deriva en el Worker lo mismo que Argon2id nativo, y luego lo termina y revoca la URL', async () => {
    const contrasena = new TextEncoder().encode('contraseña del trabajador');
    const sal = new Uint8Array(16).map((_, i) => i + 1);
    const clave = await derivarEnTrabajador(contrasena, sal, KDF);

    const f = (crypto as unknown as { argon2Sync: Argon2Sync }).argon2Sync;
    const esperada = f('argon2id', { message: contrasena, nonce: sal, parallelism: 1, tagLength: 32, memory: KDF.m, passes: KDF.t });
    expect(Buffer.from(clave).toString('hex')).toBe(esperada.toString('hex'));

    expect(trabajadores).toHaveLength(1);
    expect(trabajadores[0].terminado).toBe(true);
    expect(revocadas).toEqual([trabajadores[0].url]);
  }, 60_000);

  it('el script del Blob es el núcleo más el pegamento, sin eval ni new Function', async () => {
    await derivarEnTrabajador(new TextEncoder().encode('x'.repeat(12)), new Uint8Array(16), { ...KDF, m: 64, t: 1 } as unknown as typeof KDF);
    const codigo = await [...scripts.values()][0].text();
    expect(codigo).toContain('var Nucleo = (function(){');
    expect(codigo).toContain('onmessage');
    expect(codigo).not.toMatch(/\beval\b|new\s+Function/);
  });

  it('si el Worker falla, rechaza, y también lo termina y revoca la URL', async () => {
    romper = true;
    await expect(derivarEnTrabajador(new Uint8Array(12), new Uint8Array(16), KDF)).rejects.toThrow();
    expect(trabajadores[0].terminado).toBe(true);
    expect(revocadas).toEqual([trabajadores[0].url]);
  });

  it('si el núcleo lanza dentro del Worker (p ≠ 1), rechaza, termina y revoca', async () => {
    await expect(
      derivarEnTrabajador(new Uint8Array(12), new Uint8Array(16), { ...KDF, p: 2 } as unknown as typeof KDF),
    ).rejects.toThrow(/p = 1/);
    expect(trabajadores[0].terminado).toBe(true);
    expect(revocadas).toEqual([trabajadores[0].url]);
  });
});
