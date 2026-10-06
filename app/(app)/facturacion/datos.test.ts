import { beforeEach, describe, expect, it, vi } from 'vitest';

const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const estadoDeCuenta = vi.fn();
vi.mock('@/lib/cuentas/candado', () => ({ estadoDeCuenta: (...a: unknown[]) => estadoDeCuenta(...a) }));

const connection = vi.fn().mockResolvedValue(undefined);
vi.mock('next/server', () => ({ connection: () => connection() }));

const { cargarCobrosRecientes, cargarContexto, cargarOpcionesProfesional, cargarPacientesParaCobro, cargarPendientes } =
  await import('./datos');

const PRO = '1b2c3d4e-5f60-4a71-8b82-9c0d1e2f3a40';
const PRO2 = '2c3d4e5f-6071-4b82-9c93-0d1e2f3a4b50';

type Llamada = [metodo: string, argumentos: unknown[]];

/**
 * Un `from(tabla)` de supabase-js que encadena cualquier método, apunta cada llamada y, al
 * esperarse, devuelve el resultado que se le dio para esa tabla.
 */
function crearSupabaseFalso(resultados: Record<string, { data: unknown; error: unknown }> = {}, zona = 'Europe/Madrid') {
  const llamadas: Record<string, Llamada[]> = {};
  const from = vi.fn((tabla: string) => {
    const registro: Llamada[] = (llamadas[tabla] ??= []);
    const resultado = resultados[tabla] ?? { data: [], error: null };
    const consulta: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get(_, metodo) {
          if (metodo === 'then') {
            return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, ko);
          }
          return (...argumentos: unknown[]) => {
            registro.push([String(metodo), argumentos]);
            return consulta;
          };
        },
      },
    );
    return consulta;
  });
  const rpc = vi.fn().mockResolvedValue({ data: zona, error: null });
  return { supabase: { from, rpc }, llamadas };
}

function comoRol(rol: string, resultados?: Parameters<typeof crearSupabaseFalso>[0], zona?: string) {
  const falso = crearSupabaseFalso(resultados, zona);
  exigirSesion.mockResolvedValue({ supabase: falso.supabase, usuario: { id: 'usr' } });
  estadoDeCuenta.mockResolvedValue({ rol, estado: 'activo' });
  return falso;
}

function vista(paciente: string, devengado: number, cobrado: number, profesional = PRO) {
  const d = devengado - cobrado;
  return {
    paciente_id: paciente,
    profesional_id: profesional,
    devengado_centimos: devengado,
    cobrado_centimos: cobrado,
    pendiente_centimos: Math.max(d, 0),
    excedente_centimos: Math.max(-d, 0),
    estado: d > 0 ? 'pendiente' : d === 0 ? 'cobrado' : 'cobrado_de_mas',
    citas_sin_tarifa: 0,
  };
}

beforeEach(() => {
  exigirSesion.mockReset();
  estadoDeCuenta.mockReset();
  connection.mockClear();
});

describe('cargarContexto · el filtro de profesional es solo del administrador', () => {
  it('administrador con ?profesional=<uuid>: filtra, y la consulta de pendientes lleva el eq', async () => {
    const { llamadas } = comoRol('administrador');
    const contexto = await cargarContexto(Promise.resolve({ profesional: PRO }));
    expect(contexto.profesionalFiltrado).toBe(PRO);

    await cargarPendientes(contexto.profesionalFiltrado);
    expect(llamadas.pendiente_paciente).toContainEqual(['eq', ['profesional_id', PRO]]);
  });

  it.each(['profesional_sanitario', 'tecnico_administrativo'])(
    '%s con el mismo parámetro: sin filtro, y la consulta NO lleva el eq',
    async (rol) => {
      const { llamadas } = comoRol(rol);
      const contexto = await cargarContexto(Promise.resolve({ profesional: PRO }));
      expect(contexto.profesionalFiltrado).toBeNull();

      await cargarPendientes(contexto.profesionalFiltrado);
      expect(llamadas.pendiente_paciente.some(([m]) => m === 'eq')).toBe(false);
    },
  );

  it.each([['Ana García'], [[PRO, PRO2]], [undefined]])('administrador con %j: sin filtro', async (valor) => {
    comoRol('administrador');
    const contexto = await cargarContexto(Promise.resolve({ profesional: valor }));
    expect(contexto.profesionalFiltrado).toBeNull();
  });

  it('el rol sale de la base, filtrado por la lista blanca', async () => {
    comoRol('superusuario');
    expect((await cargarContexto(Promise.resolve({}))).rol).toBeNull();
  });

  it('la zona es la de la organización (centro null) y «hoy» se calcula después de connection()', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T23:30:00Z'));
    try {
      const { supabase } = comoRol('administrador', {}, 'Atlantic/Canary');
      const contexto = await cargarContexto(Promise.resolve({}));
      expect(supabase.rpc).toHaveBeenCalledWith('zona_horaria_centro', { p_centro_id: null });
      expect(contexto.zona).toBe('Atlantic/Canary');
      expect(contexto.hoy).toBe('2026-10-07');
      expect(connection).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('cargarPendientes', () => {
  it('une los nombres leídos aparte, por id, y ordena', async () => {
    const { llamadas } = comoRol('administrador', {
      pendiente_paciente: { data: [vista('p-a', 5000, 0), vista('p-b', 100, 1100)], error: null },
      pacientes: {
        data: [
          { id: 'p-a', nombre: 'Ana', apellidos: 'Ruiz' },
          { id: 'p-b', nombre: 'Bea', apellidos: 'Sanz' },
        ],
        error: null,
      },
    });

    const resultado = await cargarPendientes(null);

    expect(llamadas.pacientes).toContainEqual(['in', ['id', ['p-a', 'p-b']]]);
    expect(resultado.ok && resultado.filas.map((f) => [f.pacienteId, f.nombre, f.estado])).toEqual([
      ['p-b', 'Bea', 'cobrado_de_mas'],
      ['p-a', 'Ana', 'pendiente'],
    ]);
  });

  it('una fila que no casa con pendiente() es un error del bloque, no una cifra', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    comoRol('administrador', {
      pendiente_paciente: { data: [{ ...vista('p-a', 5000, 0), estado: 'cobrado' }], error: null },
    });
    expect((await cargarPendientes(null)).ok).toBe(false);
  });

  it('un error de la vista es un error del bloque', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    comoRol('administrador', { pendiente_paciente: { data: null, error: { code: '42501' } } });
    expect((await cargarPendientes(null)).ok).toBe(false);
  });
});

describe('cargarCobrosRecientes', () => {
  const fila = {
    id: 'c-1',
    paciente_id: 'p-a',
    importe: '-20.00',
    fecha: '2026-10-05',
    forma_pago: 'bizum',
    referencia: null,
    motivo: 'Sesión cobrada dos veces',
    pacientes: { nombre: 'Ana', apellidos: 'Ruiz', profesional_id: PRO },
  };

  it('con filtro: eq sobre pacientes.profesional_id, los 20 últimos, el importe leído como texto', async () => {
    const { llamadas } = comoRol('administrador', { cobros: { data: [fila], error: null } });

    const resultado = await cargarCobrosRecientes(PRO);

    const consulta = llamadas.cobros;
    expect(String(consulta.find(([m]) => m === 'select')?.[1][0])).toContain('importe::text');
    expect(consulta).toContainEqual(['eq', ['pacientes.profesional_id', PRO]]);
    expect(consulta).toContainEqual(['order', ['fecha', { ascending: false }]]);
    expect(consulta).toContainEqual(['order', ['registrado_en', { ascending: false }]]);
    expect(consulta).toContainEqual(['limit', [20]]);
    expect(resultado).toEqual({
      ok: true,
      cobros: [
        {
          id: 'c-1',
          pacienteId: 'p-a',
          nombre: 'Ana',
          apellidos: 'Ruiz',
          importe: -2000,
          fecha: '2026-10-05',
          formaPago: 'bizum',
          referencia: null,
          motivo: 'Sesión cobrada dos veces',
        },
      ],
    });
  });

  it('sin filtro: ningún eq', async () => {
    const { llamadas } = comoRol('administrador', { cobros: { data: [], error: null } });
    await cargarCobrosRecientes(null);
    expect(llamadas.cobros.some(([m]) => m === 'eq')).toBe(false);
  });
});

describe('cargarOpcionesProfesional y cargarPacientesParaCobro', () => {
  it('los profesionales distintos de la vista sin filtrar, con su nombre', async () => {
    const { llamadas } = comoRol('administrador', {
      pendiente_paciente: { data: [{ profesional_id: PRO }, { profesional_id: PRO2 }, { profesional_id: PRO }], error: null },
      perfiles: {
        data: [
          { id: PRO2, nombre_completo: 'Beatriz Gil' },
          { id: PRO, nombre_completo: 'Alberto Paz' },
        ],
        error: null,
      },
    });

    const opciones = await cargarOpcionesProfesional();

    expect(llamadas.pendiente_paciente.some(([m]) => m === 'eq')).toBe(false);
    expect(llamadas.perfiles).toContainEqual(['in', ['id', [PRO, PRO2]]]);
    expect(opciones).toEqual([
      { id: PRO2, nombre: 'Beatriz Gil' },
      { id: PRO, nombre: 'Alberto Paz' },
    ]);
  });

  it('los pacientes para el cobro: sin fusionados, por apellidos', async () => {
    const { llamadas } = comoRol('administrador', {
      pacientes: { data: [{ id: 'p-a', nombre: 'Ana', apellidos: 'Ruiz' }], error: null },
    });

    const pacientes = await cargarPacientesParaCobro();

    expect(llamadas.pacientes).toContainEqual(['is', ['fusionado_en', null]]);
    expect(llamadas.pacientes).toContainEqual(['order', ['apellidos']]);
    expect(pacientes).toEqual([{ id: 'p-a', nombre: 'Ana', apellidos: 'Ruiz' }]);
  });
});
