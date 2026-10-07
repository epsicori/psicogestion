import { beforeEach, describe, expect, it, vi } from 'vitest';

const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const estadoDeCuenta = vi.fn();
vi.mock('@/lib/cuentas/candado', () => ({ estadoDeCuenta: (...a: unknown[]) => estadoDeCuenta(...a) }));

const connection = vi.fn().mockResolvedValue(undefined);
vi.mock('next/server', () => ({ connection: () => connection() }));

const {
  TAMANO_PAGINA,
  cargarCobrosRecientes,
  cargarContexto,
  cargarOpcionesProfesional,
  cargarPacientesParaCobro,
  cargarPendientes,
  cargarResumen,
} = await import('./datos');

const PRO = '1b2c3d4e-5f60-4a71-8b82-9c0d1e2f3a40';
const PRO2 = '2c3d4e5f-6071-4b82-9c93-0d1e2f3a4b50';

type Llamada = [metodo: string, argumentos: unknown[]];
type Resultado = { data: unknown; error: unknown };
type Resultados = Record<string, Resultado | Resultado[]>;
type ResultadosRpc = Record<string, Resultado>;

/**
 * Un `from(tabla)` de supabase-js que encadena cualquier método, apunta cada llamada y, al
 * esperarse, devuelve el resultado que se le dio para esa tabla. Si se da una lista, cada
 * consulta a esa tabla consume la siguiente (la última se repite): así se prueban las páginas.
 * `rpc` responde por nombre; la zona del centro es la de siempre.
 */
function crearSupabaseFalso(resultados: Resultados = {}, zona = 'Europe/Madrid', resultadosRpc: ResultadosRpc = {}) {
  const llamadas: Record<string, Llamada[]> = {};
  const consultas: Record<string, number> = {};
  const from = vi.fn((tabla: string) => {
    const registro: Llamada[] = (llamadas[tabla] ??= []);
    const dado = resultados[tabla] ?? { data: [], error: null };
    const indice = (consultas[tabla] ??= 0);
    consultas[tabla] += 1;
    const resultado = Array.isArray(dado) ? dado[Math.min(indice, dado.length - 1)] : dado;
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
  const llamadasRpc: [string, unknown][] = [];
  const rpc = vi.fn((nombre: string, parametros?: unknown) => {
    llamadasRpc.push([nombre, parametros]);
    if (nombre === 'zona_horaria_centro') return Promise.resolve({ data: zona, error: null });
    return Promise.resolve(resultadosRpc[nombre] ?? { data: [], error: null });
  });
  return { supabase: { from, rpc }, llamadas, llamadasRpc };
}

function comoRol(rol: string, resultados?: Resultados, zona?: string, resultadosRpc?: ResultadosRpc) {
  const falso = crearSupabaseFalso(resultados, zona, resultadosRpc);
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

    await cargarPendientes(contexto.profesionalFiltrado, 1);
    expect(llamadas.pendiente_paciente).toContainEqual(['eq', ['profesional_id', PRO]]);
  });

  it.each(['profesional_sanitario', 'tecnico_administrativo'])(
    '%s con el mismo parámetro: sin filtro, y la consulta NO lleva el eq',
    async (rol) => {
      const { llamadas } = comoRol(rol);
      const contexto = await cargarContexto(Promise.resolve({ profesional: PRO }));
      expect(contexto.profesionalFiltrado).toBeNull();

      await cargarPendientes(contexto.profesionalFiltrado, 1);
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

describe('cargarContexto · la página sale de ?pagina y la leen todos los roles', () => {
  it.each(['administrador', 'profesional_sanitario', 'tecnico_administrativo'])('%s con ?pagina=3 → 3', async (rol) => {
    comoRol(rol);
    expect((await cargarContexto(Promise.resolve({ pagina: '3' }))).pagina).toBe(3);
  });

  it.each([['abc'], ['0'], ['-2'], ['1.5'], ['1e21'], ['9007199254740993'], [['2', '3']], [undefined], ['']])(
    '?pagina=%j no valida → 1',
    async (valor) => {
      comoRol('administrador');
      expect((await cargarContexto(Promise.resolve({ pagina: valor }))).pagina).toBe(1);
    },
  );

  it('B-H4: sin tope, 999999 vale (la página se acota después, contra el total)', async () => {
    comoRol('administrador');
    expect((await cargarContexto(Promise.resolve({ pagina: '999999' }))).pagina).toBe(999999);
  });
});

describe('cargarResumen · cifras exactas de la base (resumen_pendiente)', () => {
  const fila = { pendiente_total_centimos: 21000, pacientes_con_pendiente: 3, pacientes_cobrado_de_mas: 1, filas: 7 };

  it('sin filtro llama a la función sin parámetros; con filtro, con p_profesional_id', async () => {
    const { supabase } = comoRol('administrador', {}, undefined, { resumen_pendiente: { data: [fila], error: null } });

    const sin = await cargarResumen(null);
    expect(supabase.rpc).toHaveBeenCalledWith('resumen_pendiente', {});
    expect(sin).toEqual({ ok: true, resumen: { pendienteTotal: 21000, conPendiente: 3, deMas: 1, filas: 7 } });

    const con = await cargarResumen(PRO);
    expect(supabase.rpc).toHaveBeenCalledWith('resumen_pendiente', { p_profesional_id: PRO });
    expect(con.ok).toBe(true);
  });

  it.each([
    ['dos filas', [fila, fila]],
    ['ninguna fila', []],
    ['un número no entero', [{ ...fila, pendiente_total_centimos: 10.5 }]],
    ['un número negativo', [{ ...fila, filas: -1 }]],
    ['un número que no es número', [{ ...fila, pacientes_con_pendiente: '3' }]],
    ['un número fuera del entero seguro', [{ ...fila, pendiente_total_centimos: 2 ** 60 }]],
  ])('%s → { ok: false }', async (_, data) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    comoRol('administrador', {}, undefined, { resumen_pendiente: { data, error: null } });
    expect(await cargarResumen(PRO2)).toEqual({ ok: false });
  });

  it('un error de la base → { ok: false }', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    comoRol('administrador', {}, undefined, { resumen_pendiente: { data: null, error: { code: '42501' } } });
    expect(await cargarResumen(PRO)).toEqual({ ok: false });
  });
});

describe('cargarPendientes · la base ordena y pagina; aquí solo se cablea', () => {
  it('la página 2 pide .range(50, 99) y los tres .order, en ese orden', async () => {
    const { llamadas } = comoRol('administrador', {
      pendiente_paciente: { data: [vista('p-a', 5000, 0)], error: null },
      pacientes: { data: [{ id: 'p-a', nombre: 'Ana', apellidos: 'Ruiz' }], error: null },
    });

    await cargarPendientes(null, 2);

    expect(TAMANO_PAGINA).toBe(50);
    const consulta = llamadas.pendiente_paciente;
    expect(consulta).toContainEqual(['range', [50, 99]]);
    expect(consulta.filter(([m]) => m === 'order')).toEqual([
      ['order', ['excedente_centimos', { ascending: false }]],
      ['order', ['pendiente_centimos', { ascending: false }]],
      ['order', ['paciente_id']],
    ]);
  });

  it('la página 1 pide .range(0, 49)', async () => {
    const { llamadas } = comoRol('administrador');
    await cargarPendientes(null, 1);
    expect(llamadas.pendiente_paciente).toContainEqual(['range', [0, 49]]);
  });

  it('une los nombres leídos aparte, por id, con .in sobre 50 ids como mucho, y respeta el orden de la base', async () => {
    const ids = Array.from({ length: TAMANO_PAGINA }, (_, i) => `p-${String(i).padStart(2, '0')}`);
    const { llamadas } = comoRol('administrador', {
      pendiente_paciente: { data: ids.map((id) => vista(id, 5000, 0)), error: null },
      pacientes: { data: ids.map((id) => ({ id, nombre: `N${id}`, apellidos: 'Ruiz' })), error: null },
    });

    const resultado = await cargarPendientes(null, 1);

    const enIn = llamadas.pacientes.filter(([m]) => m === 'in');
    expect(enIn).toHaveLength(1);
    expect((enIn[0][1][1] as string[]).length).toBeLessThanOrEqual(TAMANO_PAGINA);
    expect(resultado.ok && resultado.filas.map((f) => f.pacienteId)).toEqual(ids);
    expect(resultado.ok && resultado.filas[0].nombre).toBe('Np-00');
  });

  it('una fila que no casa con pendiente() es un error del bloque, no una cifra', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    comoRol('administrador', {
      pendiente_paciente: { data: [{ ...vista('p-a', 5000, 0), estado: 'cobrado' }], error: null },
    });
    expect((await cargarPendientes(null, 1)).ok).toBe(false);
  });

  it('un error de la vista es un error del bloque', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    comoRol('administrador', { pendiente_paciente: { data: null, error: { code: '42501' } } });
    expect((await cargarPendientes(null, 1)).ok).toBe(false);
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

describe('cargarOpcionesProfesional · por la función, nunca por perfiles', () => {
  const dosProfesionales = {
    profesionales_del_pendiente: {
      data: [
        { id: PRO, nombre_completo: 'Ana Márquez' },
        { id: PRO2, nombre_completo: 'Bruno Ferrer' },
      ],
      error: null,
    },
  };

  it('llama a rpc(profesionales_del_pendiente), nunca a from(perfiles), y devuelve id y nombre', async () => {
    const { supabase, llamadasRpc } = comoRol('administrador', {}, undefined, dosProfesionales);

    const resultado = await cargarOpcionesProfesional(null);
    expect(resultado.ok).toBe(true);
    const opciones = resultado.ok ? resultado.opciones : [];

    expect(llamadasRpc.map(([n]) => n)).toContain('profesionales_del_pendiente');
    expect(supabase.from).not.toHaveBeenCalledWith('perfiles');
    expect(supabase.from).not.toHaveBeenCalledWith('directorio_perfiles');
    expect(opciones).toEqual([
      { id: PRO, nombre: 'Ana Márquez' },
      { id: PRO2, nombre: 'Bruno Ferrer' },
    ]);
  });

  it('con elegido entre las opciones no lee el directorio', async () => {
    const { supabase } = comoRol('administrador', {}, undefined, dosProfesionales);
    const resultado = await cargarOpcionesProfesional(PRO2);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(resultado.ok && resultado.opciones).toHaveLength(2);
  });

  it('con elegido fuera de la lista lee directorio_perfiles y lo antepone con su nombre', async () => {
    const OTRO = '3d4e5f60-7182-4c93-8da4-1e2f3a4b5c60';
    const { supabase, llamadas } = comoRol(
      'administrador',
      { directorio_perfiles: { data: { id: OTRO, nombre_completo: 'Carla Sanz' }, error: null } },
      undefined,
      dosProfesionales,
    );

    const resultado = await cargarOpcionesProfesional(OTRO);
    const opciones = resultado.ok ? resultado.opciones : [];

    expect(supabase.from).toHaveBeenCalledWith('directorio_perfiles');
    expect(supabase.from).not.toHaveBeenCalledWith('perfiles');
    expect(llamadas.directorio_perfiles).toContainEqual(['eq', ['id', OTRO]]);
    expect(opciones[0]).toEqual({ id: OTRO, nombre: 'Carla Sanz' });
    expect(opciones).toHaveLength(3);
  });

  it('con elegido que no existe, lo antepone como «Profesional no encontrado»', async () => {
    const OTRO = '3d4e5f60-7182-4c93-8da4-1e2f3a4b5c60';
    comoRol('administrador', { directorio_perfiles: { data: null, error: null } }, undefined, dosProfesionales);
    const resultado = await cargarOpcionesProfesional(OTRO);
    expect(resultado.ok && resultado.opciones[0]).toEqual({ id: OTRO, nombre: 'Profesional no encontrado' });
  });

  it('A-H3: un fallo de la función es { ok: false }, no una lista vacía', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    comoRol('administrador', {}, undefined, { profesionales_del_pendiente: { data: null, error: { code: '42501' } } });
    expect(await cargarOpcionesProfesional(PRO)).toEqual({ ok: false });
  });

  it('A-H3: un error del directorio es { ok: false }, no «Profesional no encontrado»', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const OTRO = '3d4e5f60-7182-4c93-8da4-1e2f3a4b5c60';
    comoRol(
      'administrador',
      { directorio_perfiles: { data: null, error: { code: '57014' } } },
      undefined,
      dosProfesionales,
    );
    expect(await cargarOpcionesProfesional(OTRO)).toEqual({ ok: false });
  });
});

describe('cargarPacientesParaCobro · por páginas de 1000', () => {
  const pagina = (desde: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `p-${desde + i}`, nombre: 'N', apellidos: 'A' }));

  it('una página corta: una sola consulta, sin fusionados, ordenada y con range(0, 999)', async () => {
    const { llamadas } = comoRol('administrador', { pacientes: { data: pagina(0, 3), error: null } });

    const resultado = await cargarPacientesParaCobro();

    expect(llamadas.pacientes).toContainEqual(['is', ['fusionado_en', null]]);
    expect(llamadas.pacientes.filter(([m]) => m === 'order')).toEqual([
      ['order', ['apellidos']],
      ['order', ['nombre']],
      ['order', ['id']],
    ]);
    expect(llamadas.pacientes.filter(([m]) => m === 'range')).toEqual([['range', [0, 999]]]);
    expect(resultado).toEqual({ ok: true, pacientes: pagina(0, 3) });
  });

  it('pide una segunda página cuando la primera trae 1000 filas, y para con la corta', async () => {
    const { llamadas } = comoRol('administrador', {
      pacientes: [
        { data: pagina(0, 1000), error: null },
        { data: pagina(1000, 5), error: null },
      ],
    });

    const resultado = await cargarPacientesParaCobro();

    expect(llamadas.pacientes.filter(([m]) => m === 'range')).toEqual([
      ['range', [0, 999]],
      ['range', [1000, 1999]],
    ]);
    expect(resultado.ok && resultado.pacientes).toHaveLength(1005);
  });

  it('deduplica por id', async () => {
    comoRol('administrador', {
      pacientes: [
        { data: pagina(0, 1000), error: null },
        { data: pagina(999, 3), error: null },
      ],
    });
    const resultado = await cargarPacientesParaCobro();
    expect(resultado.ok && resultado.pacientes).toHaveLength(1002);
  });

  it('un error en la segunda página es { ok: false }, no una lista a medias', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    comoRol('administrador', {
      pacientes: [
        { data: pagina(0, 1000), error: null },
        { data: null, error: { code: '57014' } },
      ],
    });
    expect(await cargarPacientesParaCobro()).toEqual({ ok: false });
  });

  it('un error en la primera es { ok: false }', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    comoRol('administrador', { pacientes: { data: null, error: { code: '42501' } } });
    expect(await cargarPacientesParaCobro()).toEqual({ ok: false });
  });
});
