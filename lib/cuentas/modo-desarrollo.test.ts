import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../supabase/tipos-bd';

/**
 * T-033 · el segundo factor se supera solo en local, nunca en producción.
 *
 * Todo el riesgo del ticket es el fallo contrario al pedido: un modo que llegue a un
 * despliegue. Por eso la matriz del criterio 4 se ejecuta sobre la función que LEE el
 * entorno (`segundoFactorAutomaticoActivo`), reimportando el módulo en cada caso para
 * que `lib/supabase/config.ts` vuelva a leer la URL: sobre la función pura la dimensión
 * `NODE_ENV` estaría vacía y no probaría nada.
 */

const URL_LOCAL = 'http://127.0.0.1:54321';
const URL_REMOTA = 'https://abcdefgh.supabase.co';

async function importarConEntorno(entorno: {
  variable: string | undefined;
  url: string;
  nodeEnv?: 'development' | 'production';
}) {
  vi.resetModules();
  vi.stubEnv('SEGUNDO_FACTOR_AUTOMATICO_LOCAL', entorno.variable);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', entorno.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'clave-anonima-de-prueba');
  if (entorno.nodeEnv) vi.stubEnv('NODE_ENV', entorno.nodeEnv);
  return import('./modo-desarrollo');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('segundoFactorAutomaticoActivo · matriz del criterio 4 (variable × URL × NODE_ENV)', () => {
  const casos: Array<{
    variable: string | undefined;
    url: string;
    nodeEnv: 'development' | 'production';
    esperado: boolean | 'lanza';
  }> = [
    { variable: undefined, url: URL_LOCAL, nodeEnv: 'development', esperado: false },
    { variable: undefined, url: URL_LOCAL, nodeEnv: 'production', esperado: false },
    { variable: undefined, url: URL_REMOTA, nodeEnv: 'development', esperado: false },
    { variable: undefined, url: URL_REMOTA, nodeEnv: 'production', esperado: false },
    { variable: 'activo', url: URL_LOCAL, nodeEnv: 'development', esperado: true },
    { variable: 'activo', url: URL_LOCAL, nodeEnv: 'production', esperado: true },
    { variable: 'activo', url: URL_REMOTA, nodeEnv: 'development', esperado: 'lanza' },
    { variable: 'activo', url: URL_REMOTA, nodeEnv: 'production', esperado: 'lanza' },
  ];

  it.each(casos)(
    'variable=$variable · url=$url · NODE_ENV=$nodeEnv → $esperado',
    async ({ variable, url, nodeEnv, esperado }) => {
      const modulo = await importarConEntorno({ variable, url, nodeEnv });
      expect(process.env.NODE_ENV).toBe(nodeEnv);

      if (esperado === 'lanza') {
        expect(() => modulo.segundoFactorAutomaticoActivo()).toThrow(modulo.ErrorModoLocal);
        expect(() => modulo.segundoFactorAutomaticoActivo()).toThrow(/no es local/);
      } else {
        expect(modulo.segundoFactorAutomaticoActivo()).toBe(esperado);
      }
    },
  );
});

describe('decidirModoSegundoFactor · la URL se compara por host exacto', () => {
  it.each([
    'http://localhost.evil.com',
    'http://127.0.0.1.nip.io:54321',
    'http://127.0.0.1@evil.com',
    'http://evil.com/?h=127.0.0.1',
    'https://127.0.0.1:54321',
    'http://127.0.0.2:54321',
    'no-es-una-url',
  ])('rechaza %s con la variable puesta', async (url) => {
    const { decidirModoSegundoFactor, ErrorModoLocal } = await importarConEntorno({
      variable: undefined,
      url: URL_LOCAL,
    });
    expect(() => decidirModoSegundoFactor('activo', url)).toThrow(ErrorModoLocal);
  });

  it.each(['http://127.0.0.1:54321', 'http://localhost:54321'])(
    'acepta %s con la variable puesta',
    async (url) => {
      const { decidirModoSegundoFactor } = await importarConEntorno({
        variable: undefined,
        url: URL_LOCAL,
      });
      expect(decidirModoSegundoFactor('activo', url)).toBe(true);
    },
  );
});

describe('decidirModoSegundoFactor · el valor de la variable es exacto', () => {
  it.each(['1', 'true', ' activo', 'ACTIVO'])(
    'el valor «%s» no se interpreta: se rechaza',
    async (valor) => {
      const { decidirModoSegundoFactor, ErrorModoLocal } = await importarConEntorno({
        variable: undefined,
        url: URL_LOCAL,
      });
      expect(() => decidirModoSegundoFactor(valor, URL_LOCAL)).toThrow(ErrorModoLocal);
      expect(() => decidirModoSegundoFactor(valor, URL_LOCAL)).toThrow(/valor no reconocido/);
    },
  );

  it('vacía equivale a ausente', async () => {
    const { decidirModoSegundoFactor } = await importarConEntorno({
      variable: undefined,
      url: URL_LOCAL,
    });
    expect(decidirModoSegundoFactor('', URL_LOCAL)).toBe(false);
  });

  it('ausente no parsea la URL: producción no gana ningún camino de error nuevo', async () => {
    const { decidirModoSegundoFactor } = await importarConEntorno({
      variable: undefined,
      url: URL_LOCAL,
    });
    expect(decidirModoSegundoFactor(undefined, 'no-es-una-url')).toBe(false);
  });
});

describe('codigoTotp · vectores RFC 6238 (SHA-1, 6 dígitos, 30 s)', () => {
  // «12345678901234567890» en base32.
  const SECRETO_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('a los %i s da %s (ceros a la izquierda conservados)', async (segundos, esperado) => {
    const { codigoTotp } = await importarConEntorno({ variable: undefined, url: URL_LOCAL });
    expect(codigoTotp(SECRETO_RFC, segundos * 1000)).toBe(esperado);
  });

  it('un carácter fuera del alfabeto base32 lanza', async () => {
    const { codigoTotp } = await importarConEntorno({ variable: undefined, url: URL_LOCAL });
    expect(() => codigoTotp('SEMILLA1', 0)).toThrow();
  });
});

describe('FACTORES_SEMBRADOS · no deriva de la siembra', () => {
  it('cada par (id, secreto) está en el insert de auth.mfa_factors, y son exactamente cinco', async () => {
    const { FACTORES_SEMBRADOS } = await importarConEntorno({
      variable: undefined,
      url: URL_LOCAL,
    });
    const siembra = readFileSync(
      path.resolve(__dirname, '../../supabase/seed-completo.sql'),
      'utf8',
    );
    const inicio = siembra.indexOf('insert into auth.mfa_factors');
    expect(inicio).toBeGreaterThan(-1);
    const fin = siembra.indexOf('on conflict', inicio);
    const bloque = siembra.slice(inicio, fin);

    const pares = [...bloque.matchAll(/\('([0-9a-f-]{36})',[^']*'[^']*',\s*'totp',[\s\S]*?'(SEMILLA[A-Z2-7]+)'/g)].map(
      (m) => [m[1], m[2]] as const,
    );
    expect(pares).toHaveLength(5);
    expect(FACTORES_SEMBRADOS.size).toBe(5);
    for (const [id, secreto] of pares) {
      expect(FACTORES_SEMBRADOS.get(id)).toBe(secreto);
    }
  });
});

describe('superarSegundoFactorSembrado', () => {
  const ID_ANA = 'a0080004-0000-4000-8000-000000000001';

  function clienteFingido(opciones: {
    totp?: Array<{ id: string }> | null;
    errorLista?: unknown;
    errorVerificacion?: unknown;
  }) {
    const listFactors = vi.fn().mockResolvedValue({
      data: opciones.errorLista ? null : { totp: opciones.totp, all: [] },
      error: opciones.errorLista ?? null,
    });
    const challengeAndVerify = vi.fn().mockResolvedValue({
      data: opciones.errorVerificacion ? null : {},
      error: opciones.errorVerificacion ?? null,
    });
    const cliente = { auth: { mfa: { listFactors, challengeAndVerify } } };
    return {
      cliente: cliente as unknown as SupabaseClient<Database>,
      listFactors,
      challengeAndVerify,
    };
  }

  it('con el modo inactivo devuelve «inactivo» y no toca nada de MFA', async () => {
    const { superarSegundoFactorSembrado } = await importarConEntorno({
      variable: undefined,
      url: URL_LOCAL,
    });
    const { cliente, listFactors, challengeAndVerify } = clienteFingido({
      totp: [{ id: ID_ANA }],
    });

    expect(await superarSegundoFactorSembrado(cliente)).toBe('inactivo');
    expect(listFactors).not.toHaveBeenCalled();
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });

  it('con el modo activo y el factor sembrado de Ana, verifica con el código del instante', async () => {
    const { superarSegundoFactorSembrado, codigoTotp } = await importarConEntorno({
      variable: 'activo',
      url: URL_LOCAL,
    });
    vi.useFakeTimers();
    const ahora = new Date('2026-10-01T09:15:42Z').getTime();
    vi.setSystemTime(ahora);
    const { cliente, challengeAndVerify } = clienteFingido({ totp: [{ id: ID_ANA }] });

    expect(await superarSegundoFactorSembrado(cliente)).toBe('superado');
    expect(challengeAndVerify).toHaveBeenCalledTimes(1);
    expect(challengeAndVerify).toHaveBeenCalledWith({
      factorId: ID_ANA,
      code: codigoTotp('SEMILLATOTPDEMOANA', ahora),
    });
  });

  it('GEMELA · un factor verificado que no es de la siembra (cuenta real) no se supera', async () => {
    const { superarSegundoFactorSembrado } = await importarConEntorno({
      variable: 'activo',
      url: URL_LOCAL,
    });
    const { cliente, listFactors, challengeAndVerify } = clienteFingido({
      totp: [{ id: '7d1c9a52-3f0e-4b8a-9c11-2e5f6a7b8c9d' }],
    });

    expect(await superarSegundoFactorSembrado(cliente)).toBe('sin_factor_sembrado');
    expect(listFactors).toHaveBeenCalledTimes(1);
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });

  it('sin factores (lista nula) devuelve «sin_factor_sembrado» sin lanzar', async () => {
    const { superarSegundoFactorSembrado } = await importarConEntorno({
      variable: 'activo',
      url: URL_LOCAL,
    });
    const { cliente, challengeAndVerify } = clienteFingido({ totp: null });

    expect(await superarSegundoFactorSembrado(cliente)).toBe('sin_factor_sembrado');
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });

  it('si listFactors falla devuelve «fallo» sin lanzar', async () => {
    const { superarSegundoFactorSembrado } = await importarConEntorno({
      variable: 'activo',
      url: URL_LOCAL,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cliente, challengeAndVerify } = clienteFingido({
      errorLista: { code: 'unexpected_failure' },
    });

    expect(await superarSegundoFactorSembrado(cliente)).toBe('fallo');
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });

  it('si challengeAndVerify devuelve error devuelve «fallo» sin lanzar', async () => {
    const { superarSegundoFactorSembrado } = await importarConEntorno({
      variable: 'activo',
      url: URL_LOCAL,
    });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cliente } = clienteFingido({
      totp: [{ id: ID_ANA }],
      errorVerificacion: { code: 'mfa_verification_failed' },
    });

    expect(await superarSegundoFactorSembrado(cliente)).toBe('fallo');
    // Ni el secreto ni el código llegan al registro.
    const registrado = JSON.stringify(aviso.mock.calls);
    expect(registrado).not.toMatch(/SEMILLA/);
    expect(registrado).not.toMatch(/\b\d{6}\b/);
  });

  it('con el modo mal configurado (URL remota) lanza ErrorModoLocal antes de listFactors', async () => {
    const { superarSegundoFactorSembrado, ErrorModoLocal } = await importarConEntorno({
      variable: 'activo',
      url: URL_REMOTA,
    });
    const { cliente, listFactors } = clienteFingido({ totp: [{ id: ID_ANA }] });

    await expect(superarSegundoFactorSembrado(cliente)).rejects.toThrow(ErrorModoLocal);
    expect(listFactors).not.toHaveBeenCalled();
  });
});
