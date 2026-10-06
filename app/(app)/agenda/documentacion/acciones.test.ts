import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  cargarContexto: vi.fn(),
  leerPendientes: vi.fn(),
  leerNombresPacientes: vi.fn(),
}));

vi.mock('../datos', () => ({ cargarContexto: m.cargarContexto }));
vi.mock('@/lib/citas/agenda', () => ({
  leerPendientes: m.leerPendientes,
  leerNombresPacientes: m.leerNombresPacientes,
}));

import { buscarPendientes, type EstadoBusqueda } from './acciones';

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function alerta(n: number, parcial: Record<string, unknown> = {}) {
  return {
    id: id(1000 + n),
    pacienteId: id(n),
    tipo: 'nota_sin_firmar',
    fechaReferencia: '2026-09-20',
    creadaEn: '2026-09-20T10:00:00Z',
    nivel: 1,
    origenTabla: 'citas',
    origenId: `c${n}`,
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
  extra: { recortada?: boolean; total?: number } = {},
) {
  m.cargarContexto.mockResolvedValue({ ok: true, sesion: { usuario: { id: 'u1' } }, rol, hoy: '2026-10-01' });
  m.leerPendientes.mockResolvedValue({
    ok: true,
    alertas,
    total: extra.total ?? alertas.length,
    recortada: extra.recortada ?? false,
  });
  m.leerNombresPacientes.mockResolvedValue({
    ok: true,
    nombres: new Map(Object.entries(nombres).map(([k, [nombre, apellidos]]) => [k, { nombre, apellidos }])),
  });
}

describe('buscarPendientes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('un término inválido no consulta nada: ni la sesión ni la base', async () => {
    for (const termino of ['', 'a', ' a ', 'x'.repeat(101)]) {
      expect(await buscarPendientes(INICIAL, datos({ termino }))).toEqual({ fase: 'invalida' });
    }
    expect(await buscarPendientes(INICIAL, new FormData())).toEqual({ fase: 'invalida' });
    const fichero = new FormData();
    fichero.set('termino', new File(['xx'], 'x.txt'));
    expect(await buscarPendientes(INICIAL, fichero)).toEqual({ fase: 'invalida' });
    expect(m.cargarContexto).not.toHaveBeenCalled();
    expect(m.leerPendientes).not.toHaveBeenCalled();
    expect(m.leerNombresPacientes).not.toHaveBeenCalled();
  });

  it('devuelve solo los pacientes que coinciden, en el orden de urgencia, sin tildes ni mayúsculas', async () => {
    preparar(
      'profesional_sanitario',
      [alerta(1, { nivel: 1 }), alerta(2, { nivel: 3 }), alerta(3, { nivel: 2 })],
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
    preparar('profesional_sanitario', [alerta(1)], { [id(1)]: ['Ana', 'Ruiz'] });
    const r = await buscarPendientes(INICIAL, datos({ termino: 'zzz' }));
    expect(r).toMatchObject({ fase: 'resultados', grupos: [], coincidencias: 0 });
    expect(JSON.stringify(r)).not.toContain('Ruiz');
  });

  it('como mucho 20 grupos, con el total de coincidencias', async () => {
    const alertas = Array.from({ length: 25 }, (_, i) => alerta(i + 1));
    const nombres = Object.fromEntries(alertas.map((a) => [a.pacienteId, ['Marta', 'Soto'] as [string, string]]));
    preparar('profesional_sanitario', alertas, nombres);
    const r = await buscarPendientes(INICIAL, datos({ termino: 'marta' }));
    if (r.fase !== 'resultados') throw new Error('fase');
    expect(r.grupos).toHaveLength(20);
    expect(r.coincidencias).toBe(25);
    expect(r.leidos).toBe(25);
    expect(r.total).toBe(25);
  });

  it('pide los nombres de todos los grupos leídos, no solo los visibles', async () => {
    const alertas = Array.from({ length: 25 }, (_, i) => alerta(i + 1));
    preparar('profesional_sanitario', alertas, {});
    await buscarPendientes(INICIAL, datos({ termino: 'marta' }));
    expect(m.leerNombresPacientes.mock.calls[0][1]).toHaveLength(25);
  });

  it('arrastra la marca de recorte de la lectura', async () => {
    preparar('profesional_sanitario', [alerta(1)], { [id(1)]: ['Ana', 'Ruiz'] }, { recortada: true, total: 1500 });
    const r = await buscarPendientes(INICIAL, datos({ termino: 'ana' }));
    expect(r).toMatchObject({ fase: 'resultados', recortada: true, leidos: 1, total: 1500 });
  });

  it('el criterio sale del rol; el filtro del formulario solo estrecha; ninguna otra clave se lee', async () => {
    preparar('administrador', [], {});
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
    expect(m.leerPendientes).toHaveBeenCalledWith(expect.anything(), {
      soloPropias: true,
      tipos: ['informe_pendiente'],
      nivel: 2,
    });
  });

  it('al técnico no se le amplía la lista blanca con un tipo ajeno', async () => {
    preparar('tecnico_administrativo', [], {});
    await buscarPendientes(INICIAL, datos({ termino: 'ana', tipo: 'nota_sin_firmar' }));
    expect(m.leerPendientes.mock.calls[0][1].tipos).toEqual([]);
  });

  it('un fallo del contexto, de la lectura o de los nombres es «fallo»', async () => {
    m.cargarContexto.mockResolvedValue({ ok: false, mensaje: 'x' });
    expect(await buscarPendientes(INICIAL, datos({ termino: 'ana' }))).toEqual({ fase: 'fallo' });

    preparar('profesional_sanitario', [], {});
    m.leerPendientes.mockResolvedValue({ ok: false, mensaje: 'x' });
    expect(await buscarPendientes(INICIAL, datos({ termino: 'ana' }))).toEqual({ fase: 'fallo' });

    preparar('profesional_sanitario', [alerta(1)], {});
    m.leerNombresPacientes.mockResolvedValue({ ok: false, mensaje: 'x' });
    expect(await buscarPendientes(INICIAL, datos({ termino: 'ana' }))).toEqual({ fase: 'fallo' });
  });

  it('el término no sale por ninguna consola ni vuelve en el estado', async () => {
    const espias = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) => vi.spyOn(console, k));
    preparar('profesional_sanitario', [alerta(1)], { [id(1)]: ['Ana', 'Ruiz'] });
    const r = await buscarPendientes(INICIAL, datos({ termino: 'secretoXYZ' }));
    expect(JSON.stringify(r)).not.toContain('secretoXYZ');
    for (const e of espias) {
      expect(e).not.toHaveBeenCalled();
      e.mockRestore();
    }
    expect(JSON.stringify(m.leerPendientes.mock.calls)).not.toContain('secretoXYZ');
    expect(JSON.stringify(m.leerNombresPacientes.mock.calls)).not.toContain('secretoXYZ');
  });

  it('los grupos se presentan en modo desplegable, con el nombre completo', async () => {
    preparar('profesional_sanitario', [alerta(1), alerta(1, { id: id(2001) })], { [id(1)]: ['Ana', 'Ruiz'] });
    const r = await buscarPendientes(INICIAL, datos({ termino: 'ana' }));
    if (r.fase !== 'resultados') throw new Error('fase');
    expect(r.grupos[0].nombre).toBe('Ana Ruiz');
    expect(r.grupos[0].recuento).toBe(2);
  });
});
