import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CA7 de T-038. La acción es la que ordena: primero el segundo factor, después UNA
 * llamada a la base con la contraseña, y la contraseña nunca vuelve ni se registra.
 * Lo que decide la contraseña y el límite de intentos es la base (banco 13).
 */
const CONTRASENA = 'contrasena-que-no-debe-salir-nunca';
const DIEZ = Array.from({ length: 10 }, (_, i) => `CODIGO-${i}`);

const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));
vi.mock('@/lib/supabase/administracion', () => ({ crearClienteAdministracion: vi.fn() }));

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { regenerarCodigos } = await import('./acciones');

const PRIMERO = 'rpc:registro_postgres_seguro';
const SEGUNDO = 'rpc:regenerar_codigos_recuperacion';

function montar(opciones: {
  factores?: unknown;
  errorFactores?: unknown;
  errorCodigo?: unknown;
  registroSeguro?: boolean;
  errorRegistro?: unknown;
  regeneracion?: { data?: unknown; error?: unknown };
} = {}) {
  const orden: string[] = [];
  const prohibidas = {
    signInWithPassword: vi.fn(() => {
      throw new Error('signInWithPassword prohibida');
    }),
    reauthenticate: vi.fn(() => {
      throw new Error('reauthenticate prohibida');
    }),
    updateUser: vi.fn(() => {
      throw new Error('updateUser prohibida');
    }),
    signOut: vi.fn(() => {
      throw new Error('signOut prohibida');
    }),
  };
  const listFactors = vi.fn(async () => {
    orden.push('listFactors');
    return {
      data: opciones.errorFactores
        ? null
        : (opciones.factores ?? { totp: [{ id: 'factor-1', status: 'verified' }] }),
      error: opciones.errorFactores ?? null,
    };
  });
  const challengeAndVerify = vi.fn(async () => {
    orden.push('challengeAndVerify');
    return { data: opciones.errorCodigo ? null : {}, error: opciones.errorCodigo ?? null };
  });
  const rpc = vi.fn(async (nombre: string) => {
    orden.push(`rpc:${nombre}`);
    if (nombre === 'registro_postgres_seguro') {
      return { data: opciones.registroSeguro ?? true, error: opciones.errorRegistro ?? null };
    }
    return {
      data: opciones.regeneracion?.data ?? [{ motivo: 'ok', bloqueado_hasta: null, codigos: DIEZ }],
      error: opciones.regeneracion?.error ?? null,
    };
  });
  const from = vi.fn(() => ({
    select: () => ({ maybeSingle: async () => ({ data: { zona_horaria: 'Europe/Madrid' }, error: null }) }),
  }));
  const supabase = { rpc, from, auth: { ...prohibidas, mfa: { listFactors, challengeAndVerify } } };
  exigirSesion.mockResolvedValue({ supabase, usuario: { id: 'u' } });
  return { supabase, rpc, listFactors, challengeAndVerify, orden, prohibidas };
}

function llamadasDeRegeneracion(rpc: ReturnType<typeof montar>['rpc']) {
  return rpc.mock.calls.filter(([nombre]) => nombre === 'regenerar_codigos_recuperacion');
}

const BIEN = { contrasena: CONTRASENA, codigo: '123456' };
let consolaError: ReturnType<typeof vi.spyOn>;
let consolaLog: ReturnType<typeof vi.spyOn>;
let consolaWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  exigirSesion.mockReset();
  revalidatePath.mockReset();
  consolaError = vi.spyOn(console, 'error').mockImplementation(() => {});
  consolaLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  consolaWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

function nadaDeLaContrasena(resultado: unknown) {
  expect(JSON.stringify(resultado)).not.toContain(CONTRASENA);
  for (const espia of [consolaError, consolaLog, consolaWarn]) {
    expect(JSON.stringify(espia.mock.calls)).not.toContain(CONTRASENA);
  }
}

describe('regenerarCodigos (T-038 · CA7)', () => {
  it('las dos bien: una sola llamada a la base, POST sin opciones, y devuelve los diez códigos', async () => {
    const { rpc, challengeAndVerify } = montar();

    const r = await regenerarCodigos(BIEN);

    expect(llamadasDeRegeneracion(rpc)).toHaveLength(1);
    expect(llamadasDeRegeneracion(rpc)[0]).toEqual(['regenerar_codigos_recuperacion', { p_contrasena: CONTRASENA }]);
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' });
    expect(r.codigos).toEqual(DIEZ);
    expect(r.errores).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain(CONTRASENA);
    nadaDeLaContrasena(r);
  });

  it('el segundo factor va ANTES que la base, y la comprobación del registro antes que la contraseña', async () => {
    const { orden } = montar();

    await regenerarCodigos(BIEN);

    expect(orden).toEqual(['listFactors', 'challengeAndVerify', PRIMERO, SEGUNDO]);
  });

  it('TOTP erróneo: el error va en el campo codigo y la base no recibe NINGUNA llamada', async () => {
    const { rpc } = montar({ errorCodigo: { message: 'invalid' } });

    const r = await regenerarCodigos(BIEN);

    expect(r.errores?.codigo?.[0]).toMatch(/código/i);
    expect(r.codigos).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
    nadaDeLaContrasena(r);
  });

  it('contraseña errónea: una llamada, error en el campo contrasena y sin códigos', async () => {
    const { rpc } = montar({
      regeneracion: { data: [{ motivo: 'contrasena_incorrecta', bloqueado_hasta: null, codigos: null }] },
    });

    const r = await regenerarCodigos(BIEN);

    expect(llamadasDeRegeneracion(rpc)).toHaveLength(1);
    expect(r.errores?.contrasena?.[0]).toMatch(/contraseña/i);
    expect(r.codigos).toBeUndefined();
    nadaDeLaContrasena(r);
  });

  it('bloqueado: mensaje general con la hora en la zona de la organización, sin códigos', async () => {
    montar({
      regeneracion: {
        // 10:15 UTC son las 12:15 en Madrid en octubre (CEST).
        data: [{ motivo: 'bloqueado', bloqueado_hasta: '2026-10-03T10:15:00+00:00', codigos: null }],
      },
    });

    const r = await regenerarCodigos(BIEN);

    expect(r.mensaje).toContain('12:15');
    expect(r.errores).toBeUndefined();
    expect(r.codigos).toBeUndefined();
    nadaDeLaContrasena(r);
  });

  it('un error de la base es un mensaje general, sin códigos y sin la contraseña en consola', async () => {
    montar({ regeneracion: { error: { code: '42501', message: 'sin segundo factor reciente' } } });

    const r = await regenerarCodigos(BIEN);

    expect(r.mensaje).toBeTruthy();
    expect(r.codigos).toBeUndefined();
    nadaDeLaContrasena(r);
  });

  it('con el registro de Postgres inseguro NO se envía la contraseña y se dice por qué', async () => {
    const { rpc } = montar({ registroSeguro: false });

    const r = await regenerarCodigos(BIEN);

    expect(llamadasDeRegeneracion(rpc)).toHaveLength(0);
    expect(r.mensaje).toBeTruthy();
    expect(r.codigos).toBeUndefined();
    nadaDeLaContrasena(r);
  });

  it('si no se puede comprobar el registro (error o respuesta rara) falla cerrado', async () => {
    for (const opciones of [{ errorRegistro: { message: 'x' } }, { registroSeguro: undefined, errorRegistro: null }]) {
      const { rpc } = montar(opciones);
      if (opciones.errorRegistro === null) {
        rpc.mockImplementation((async (nombre: string) =>
          nombre === 'registro_postgres_seguro'
            ? { data: null, error: null }
            : { data: [], error: null }) as never);
      }
      const r = await regenerarCodigos(BIEN);
      expect(llamadasDeRegeneracion(rpc)).toHaveLength(0);
      expect(r.codigos).toBeUndefined();
    }
  });

  it('sin factor TOTP verificado: error general y la base no recibe ninguna llamada', async () => {
    const { rpc, challengeAndVerify } = montar({ factores: { totp: [{ id: 'f', status: 'unverified' }] } });

    const r = await regenerarCodigos(BIEN);

    expect(r.mensaje).toBeTruthy();
    expect(challengeAndVerify).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('no usa ninguna puerta de Auth que cree o cierre sesiones, ni revalida', async () => {
    const { prohibidas } = montar();

    await regenerarCodigos(BIEN);

    for (const espia of Object.values(prohibidas)) expect(espia).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 'texto', { contrasena: 1, codigo: '123456' }, { contrasena: CONTRASENA, codigo: '12' }, {}])(
    'datos mal formados %j: errores por campo, sin tocar Auth ni la base y sin el valor',
    async (datos) => {
      const { rpc, listFactors, challengeAndVerify } = montar();

      const r = await regenerarCodigos(datos);

      expect(r.errores).toBeDefined();
      expect(listFactors).not.toHaveBeenCalled();
      expect(challengeAndVerify).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      nadaDeLaContrasena(r);
    },
  );

  it('exige sesión antes que nada', async () => {
    exigirSesion.mockRejectedValue(new Error('redirect'));
    await expect(regenerarCodigos(BIEN)).rejects.toThrow('redirect');
  });
});
