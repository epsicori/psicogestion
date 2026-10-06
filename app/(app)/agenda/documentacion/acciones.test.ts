import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * D10b (T-048): se mockea solo la sesión (`../datos`). Los lectores de `@/lib/citas/agenda` son los
 * reales y corren contra un doble de PostgREST que registra cada método y sus argumentos: así se ve
 * lo que de verdad sale hacia la base, y lo que de verdad llega a la consola cuando algo falla.
 */
const m = vi.hoisted(() => ({ cargarContexto: vi.fn() }));

vi.mock('../datos', () => ({ cargarContexto: m.cargarContexto }));

import { buscarPendientes, type EstadoBusqueda } from './acciones';

type Respuesta = { data: unknown; error: unknown; count?: number | null };
type Llamada = { tabla: string; metodo: string; args: unknown[] };

const METODOS = ['select', 'eq', 'neq', 'in', 'order', 'range', 'or', 'ilike', 'textSearch', 'filter'] as const;

/**
 * El doble: cada tabla responde lo que diga la prueba, sea cual sea la cadena. Un método que no
 * está en la lista lanza `TypeError` (no se traga una llamada que el lector no hacía), y los de
 * búsqueda (`or`, `ilike`, `textSearch`, `filter`) existen para que, si alguien los usara con el
 * término, quedaran registrados y la prueba lo viera.
 */
function doble(tablas: Record<string, Respuesta>) {
  const llamadas: Llamada[] = [];
  const from = vi.fn((tabla: string) => {
    const respuesta = tablas[tabla];
    if (!respuesta) throw new TypeError(`tabla inesperada: ${tabla}`);
    const cadena: Record<string, unknown> = {};
    for (const metodo of METODOS) {
      cadena[metodo] = (...args: unknown[]) => {
        llamadas.push({ tabla, metodo, args });
        return cadena;
      };
    }
    cadena.then = (resolver: (r: Respuesta) => unknown) => Promise.resolve(respuesta).then(resolver);
    return cadena;
  });
  return { from, llamadas, sesion: { supabase: { from }, usuario: { id: 'u1' } } };
}

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function fila(n: number, parcial: Record<string, unknown> = {}) {
  return {
    id: id(1000 + n),
    paciente_id: id(n),
    tipo: 'nota_sin_firmar',
    fecha_referencia: '2026-09-20',
    creada_en: '2026-09-20T10:00:00Z',
    nivel: 1,
    origen_tabla: 'citas',
    origen_id: `c${n}`,
    ...parcial,
  };
}

function datos(campos: Record<string, string>): FormData {
  const d = new FormData();
  for (const [k, v] of Object.entries(campos)) d.set(k, v);
  return d;
}

const INICIAL: EstadoBusqueda = { fase: 'inicial' };

function preparar(
  rol: string | null,
  alertas: unknown[],
  nombres: Record<string, [string, string]>,
  extra: { count?: number | null; errorAlertas?: unknown; errorPacientes?: unknown } = {},
) {
  const d = doble({
    alertas_documentacion_nivel: {
      data: extra.errorAlertas ? null : alertas,
      error: extra.errorAlertas ?? null,
      count: extra.count === undefined ? alertas.length : extra.count,
    },
    pacientes: {
      data: extra.errorPacientes
        ? null
        : Object.entries(nombres).map(([k, [nombre, apellidos]]) => ({ id: k, nombre, apellidos })),
      error: extra.errorPacientes ?? null,
    },
  });
  m.cargarContexto.mockResolvedValue({ ok: true, sesion: d.sesion, rol, hoy: '2026-10-01' });
  return d;
}

const llamadasA = (d: ReturnType<typeof doble>, tabla: string, metodo: string) =>
  d.llamadas.filter((l) => l.tabla === tabla && l.metodo === metodo);

describe('buscarPendientes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('un término inválido no consulta nada: ni la sesión ni la base', async () => {
    const d = preparar('profesional_sanitario', [], {});
    for (const termino of ['', 'a', ' a ', 'x'.repeat(101)]) {
      expect(await buscarPendientes(INICIAL, datos({ termino }))).toEqual({ fase: 'invalida' });
    }
    expect(await buscarPendientes(INICIAL, new FormData())).toEqual({ fase: 'invalida' });
    const fichero = new FormData();
    fichero.set('termino', new File(['xx'], 'x.txt'));
    expect(await buscarPendientes(INICIAL, fichero)).toEqual({ fase: 'invalida' });
    expect(m.cargarContexto).not.toHaveBeenCalled();
    expect(d.from).not.toHaveBeenCalled();
  });

  it('devuelve solo los pacientes que coinciden, en el orden de urgencia, sin tildes ni mayúsculas', async () => {
    preparar(
      'profesional_sanitario',
      [fila(2, { nivel: 3 }), fila(3, { nivel: 2 }), fila(1, { nivel: 1 })],
      { [id(1)]: ['José', 'Pérez'], [id(2)]: ['Ana', 'Gómez Pérez'], [id(3)]: ['Luis', 'Martín'] },
    );
    const r = await buscarPendientes(INICIAL, datos({ termino: 'perez' }));
    expect(r.fase).toBe('resultados');
    if (r.fase !== 'resultados') return;
    expect(r.grupos.map((g) => g.pacienteId)).toEqual([id(2), id(1)]);
    expect(r.coincidencias).toBe(2);
    expect(r.recortada).toBe(false);
  });

  it('nada que coincida: resultados vacíos, y ningún nombre ajeno sale de la acción', async () => {
    preparar('profesional_sanitario', [fila(1)], { [id(1)]: ['Ana', 'Ruiz'] });
    const r = await buscarPendientes(INICIAL, datos({ termino: 'zzz' }));
    expect(r).toMatchObject({ fase: 'resultados', grupos: [], coincidencias: 0 });
    expect(JSON.stringify(r)).not.toContain('Ruiz');
  });

  it('como mucho 20 grupos, con el total de coincidencias (34 coinciden)', async () => {
    const alertas = Array.from({ length: 34 }, (_, i) => fila(i + 1));
    const nombres = Object.fromEntries(alertas.map((a) => [a.paciente_id, ['Marta', 'Soto'] as [string, string]]));
    preparar('profesional_sanitario', alertas, nombres);
    const r = await buscarPendientes(INICIAL, datos({ termino: 'marta' }));
    if (r.fase !== 'resultados') throw new Error('fase');
    expect(r.grupos).toHaveLength(20);
    expect(r.coincidencias).toBe(34);
    expect(r.leidos).toBe(34);
    expect(r.total).toBe(34);
  });

  it('pide los nombres de todos los grupos leídos en tandas de 100 como mucho (250 pacientes, 3 llamadas)', async () => {
    const alertas = Array.from({ length: 250 }, (_, i) => fila(i + 1));
    const d = preparar('profesional_sanitario', alertas, {});
    await buscarPendientes(INICIAL, datos({ termino: 'marta' }));
    const tandas = llamadasA(d, 'pacientes', 'in');
    expect(tandas).toHaveLength(3);
    expect(tandas.map((l) => l.args[0])).toEqual(['id', 'id', 'id']);
    expect(tandas.map((l) => (l.args[1] as string[]).length)).toEqual([100, 100, 50]);
  });

  it('arrastra la marca de recorte de la lectura', async () => {
    preparar('profesional_sanitario', [fila(1)], { [id(1)]: ['Ana', 'Ruiz'] }, { count: 1500 });
    const r = await buscarPendientes(INICIAL, datos({ termino: 'ana' }));
    expect(r).toMatchObject({ fase: 'resultados', recortada: true, leidos: 1, total: 1500 });
  });

  it('el criterio sale del rol; el filtro del formulario solo estrecha; ninguna otra clave se lee', async () => {
    const d = preparar('administrador', [], {});
    await buscarPendientes(
      INICIAL,
      datos({
        termino: 'ana',
        tipo: 'informe_pendiente',
        nivel: '2',
        rol: 'profesional_sanitario',
        soloPropias: 'false',
        tipos: 'nota_sin_firmar',
        profesional: id(7),
        paciente: id(8),
      }),
    );
    // El administrador solo ve lo propio, y el filtro de tipo y nivel se aplica.
    expect(llamadasA(d, 'alertas_documentacion_nivel', 'eq')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ args: ['profesional_id', 'u1'] }),
        expect.objectContaining({ args: ['nivel', 2] }),
      ]),
    );
    expect(llamadasA(d, 'alertas_documentacion_nivel', 'in').map((l) => l.args)).toEqual([['tipo', ['informe_pendiente']]]);
    // Ni el profesional ni el paciente del formulario llegan a la base.
    expect(JSON.stringify(d.llamadas)).not.toContain(id(7));
    expect(JSON.stringify(d.llamadas)).not.toContain(id(8));
  });

  it('un formulario que dice ser otro rol no ensancha al técnico: sigue con consentimiento_pendiente', async () => {
    const d = preparar('tecnico_administrativo', [], {});
    await buscarPendientes(
      INICIAL,
      datos({ termino: 'ana', rol: 'profesional_sanitario', tipos: 'nota_sin_firmar', soloPropias: 'false' }),
    );
    expect(llamadasA(d, 'alertas_documentacion_nivel', 'in').map((l) => l.args)).toEqual([
      ['tipo', ['consentimiento_pendiente']],
    ]);
    expect(llamadasA(d, 'alertas_documentacion_nivel', 'eq').map((l) => l.args[0])).not.toContain('profesional_id');
  });

  it('al técnico no se le amplía la lista blanca con un tipo ajeno: no se consulta nada', async () => {
    const d = preparar('tecnico_administrativo', [], {});
    const r = await buscarPendientes(INICIAL, datos({ termino: 'ana', tipo: 'nota_sin_firmar' }));
    expect(d.from).not.toHaveBeenCalled();
    expect(r).toMatchObject({ fase: 'resultados', grupos: [], coincidencias: 0 });
  });

  it('un fallo del contexto, de la lectura o de los nombres es «fallo»', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    m.cargarContexto.mockResolvedValue({ ok: false, mensaje: 'x' });
    expect(await buscarPendientes(INICIAL, datos({ termino: 'ana' }))).toEqual({ fase: 'fallo' });

    preparar('profesional_sanitario', [], {}, { errorAlertas: { code: '42501', message: 'x' } });
    expect(await buscarPendientes(INICIAL, datos({ termino: 'ana' }))).toEqual({ fase: 'fallo' });

    preparar('profesional_sanitario', [fila(1)], {}, { errorPacientes: { code: '42501', message: 'x' } });
    expect(await buscarPendientes(INICIAL, datos({ termino: 'ana' }))).toEqual({ fase: 'fallo' });
  });

  // D10b (4): el término no llega a ningún filtro de PostgREST, ni crudo ni normalizado.
  it('ningún argumento de ninguna llamada a la base lleva el término, crudo ni normalizado', async () => {
    const d = preparar('profesional_sanitario', [fila(1)], { [id(1)]: ['Zoé', 'Ñandú'] });
    const r = await buscarPendientes(INICIAL, datos({ termino: ' Zoé Ñandú ' }));
    expect(r).toMatchObject({ fase: 'resultados', coincidencias: 1 });
    expect(d.llamadas.length).toBeGreaterThan(0);
    const registro = JSON.stringify(d.llamadas).toLowerCase();
    for (const parte of ['zoé', 'zoe', 'ñandú', 'nandu']) expect(registro).not.toContain(parte);
    for (const metodo of ['or', 'ilike', 'textSearch', 'filter']) {
      expect(d.llamadas.filter((l) => l.metodo === metodo)).toEqual([]);
    }
  });

  // D10b (5): ni en el camino feliz ni en ninguno de los de fallo el término sale por la consola.
  it('con un error de la base, ni la consola recibe el término ni el estado lo devuelve', async () => {
    const consolas = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {}),
    );
    const registrado = () => JSON.stringify(consolas.flatMap((e) => e.mock.calls)).toLowerCase();

    // Camino feliz.
    preparar('profesional_sanitario', [fila(1)], { [id(1)]: ['Ana', 'Ruiz'] });
    const feliz = await buscarPendientes(INICIAL, datos({ termino: 'secretoXYZ' }));
    expect(JSON.stringify(feliz)).not.toContain('secretoXYZ');
    expect(registrado()).not.toContain('secretoxyz');

    // Falla la lectura de alertas.
    preparar('profesional_sanitario', [], {}, { errorAlertas: { code: '42501', message: 'permission denied' } });
    const f1 = await buscarPendientes(INICIAL, datos({ termino: 'secretoXYZ' }));
    expect(f1).toEqual({ fase: 'fallo' });

    // Falla la lectura de nombres.
    preparar('profesional_sanitario', [fila(1)], {}, { errorPacientes: { code: '08006', message: 'connection failure' } });
    const f2 = await buscarPendientes(INICIAL, datos({ termino: 'secretoXYZ' }));
    expect(f2).toEqual({ fase: 'fallo' });

    // Falla la sesión.
    m.cargarContexto.mockResolvedValue({ ok: false, mensaje: 'sin sesión' });
    expect(await buscarPendientes(INICIAL, datos({ termino: 'secretoXYZ' }))).toEqual({ fase: 'fallo' });

    // La consola sí se usó en los fallos (los lectores registran su error): el espía está vivo.
    expect(consolas[3].mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(registrado()).not.toContain('secretoxyz');
    for (const e of consolas) e.mockRestore();
  });

  it('los grupos se presentan en modo desplegable, con el nombre completo', async () => {
    preparar('profesional_sanitario', [fila(1), fila(1, { id: id(2001) })], { [id(1)]: ['Ana', 'Ruiz'] });
    const r = await buscarPendientes(INICIAL, datos({ termino: 'ana' }));
    if (r.fase !== 'resultados') throw new Error('fase');
    expect(r.grupos[0].nombre).toBe('Ana Ruiz');
    expect(r.grupos[0].recuento).toBe(2);
  });
});
