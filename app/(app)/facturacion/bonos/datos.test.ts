import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const estadoDeCuenta = vi.fn();
vi.mock('@/lib/cuentas/candado', () => ({ estadoDeCuenta: (...a: unknown[]) => estadoDeCuenta(...a) }));

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

const { cargarBonos, cargarContextoBonos, cargarProfesionalesDeBonos } = await import('./datos');

const PRO = '1b2c3d4e-5f60-4a71-8b82-9c0d1e2f3a40';
const PAC1 = '6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60';
const PAC2 = '7a2b3c4d-5e6f-4a70-9b81-1c2d3e4f5a60';
const B1 = 'b0000000-0000-4000-8000-000000000001';
const B2 = 'b0000000-0000-4000-8000-000000000002';

type Llamada = [metodo: string, argumentos: unknown[]];
type Resultado = { data: unknown; error: unknown };
type Resultados = Record<string, Resultado | Resultado[]>;

/** Un `from(tabla)` que encadena cualquier método, apunta cada llamada y devuelve el resultado dado (o el siguiente de la lista). */
function crearSupabaseFalso(resultados: Resultados = {}, zona = 'Europe/Madrid') {
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
  const rpc = vi.fn((nombre: string) =>
    Promise.resolve(nombre === 'zona_horaria_centro' ? { data: zona, error: null } : { data: [], error: null }),
  );
  return { supabase: { from, rpc }, llamadas };
}

function comoRol(rol: string, resultados?: Resultados, zona?: string) {
  const falso = crearSupabaseFalso(resultados, zona);
  exigirSesion.mockResolvedValue({ supabase: falso.supabase, usuario: { id: 'usr' } });
  estadoDeCuenta.mockResolvedValue({ rol, estado: 'activo' });
  return falso;
}

const filaVista = (bono: string, paciente: string, totales: number | null, consumidas: number | null, caducidad: string | null = null) => ({
  bono_id: bono,
  paciente_id: paciente,
  sesiones_totales: totales,
  sesiones_consumidas: consumidas,
  caducidad,
});

beforeEach(() => {
  exigirSesion.mockReset();
  estadoDeCuenta.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('cargarBonos · el saldo se lee de la vista y se deriva', () => {
  it('pide bonos_consumo sin columna saldo, y el saldo pintado es totales − consumidas', async () => {
    const { llamadas } = comoRol('administrador', {
      bonos_consumo: { data: [filaVista(B1, PAC1, 5, 3)], error: null },
      bonos: { data: [{ id: B1, importe: '150.00', creado_en: '2026-10-01T10:00:00Z' }], error: null },
      pacientes: { data: [{ id: PAC1, nombre: 'Ana', apellidos: 'Gil', profesional_id: PRO }], error: null },
    });

    const r = await cargarBonos('2026-10-14');

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bonos).toHaveLength(1);
    expect(r.bonos[0]).toMatchObject({
      bonoId: B1,
      sesionesTotales: 5,
      sesionesConsumidas: 3,
      importe: 15000,
      nombre: 'Ana',
      profesionalId: PRO,
      lectura: { estado: 'vigente', saldo: 2 },
    });
    const columnas = llamadas.bonos_consumo.find(([m]) => m === 'select')?.[1][0] as string;
    expect(columnas).toBe('bono_id, paciente_id, sesiones_totales, sesiones_consumidas, caducidad');
    expect(columnas).not.toContain('saldo');
    // El importe se lee como texto: nunca pasa por coma flotante.
    expect(llamadas.bonos.find(([m]) => m === 'select')?.[1][0]).toContain('importe::text');
  });

  it('con pacienteId pide solo ese paciente', async () => {
    const { llamadas } = comoRol('profesional_sanitario');
    await cargarBonos('2026-10-14', PAC1);
    expect(llamadas.bonos_consumo).toContainEqual(['eq', ['paciente_id', PAC1]]);
  });

  it('lee la vista en lotes de 1000 hasta que uno viene corto', async () => {
    const lleno = Array.from({ length: 1000 }, (_, i) =>
      filaVista(`b0000000-0000-4000-8000-${String(i).padStart(12, '0')}`, PAC1, 5, 0),
    );
    const { llamadas } = comoRol('administrador', {
      bonos_consumo: [
        { data: lleno, error: null },
        { data: [filaVista(B2, PAC2, 3, 1)], error: null },
      ],
    });
    const r = await cargarBonos('2026-10-14');
    expect(r.ok && r.bonos.length).toBe(0); // sin filas en `bonos` no hay importe: se descartan y se registran
    const rangos = llamadas.bonos_consumo.filter(([m]) => m === 'range').map(([, a]) => a);
    expect(rangos).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('una fila con sesiones_totales nulas se descarta y se registra: nunca NaN', async () => {
    comoRol('administrador', {
      bonos_consumo: { data: [filaVista(B1, PAC1, null, 2), filaVista(B2, PAC1, 4, 1)], error: null },
      bonos: { data: [{ id: B2, importe: '80.00', creado_en: '2026-10-01T10:00:00Z' }], error: null },
      pacientes: { data: [{ id: PAC1, nombre: 'Ana', apellidos: 'Gil', profesional_id: PRO }], error: null },
    });
    const r = await cargarBonos('2026-10-14');
    expect(r.ok && r.bonos.map((b) => b.bonoId)).toEqual([B2]);
    expect(console.error).toHaveBeenCalled();
  });

  it('un error en cualquier lectura es { ok: false }', async () => {
    comoRol('administrador', { bonos_consumo: { data: null, error: { code: 'XX000' } } });
    expect(await cargarBonos('2026-10-14')).toEqual({ ok: false });
  });

  it('un error al leer los importes es { ok: false }', async () => {
    comoRol('administrador', {
      bonos_consumo: { data: [filaVista(B1, PAC1, 5, 3)], error: null },
      bonos: { data: null, error: { code: 'XX000' } },
    });
    expect(await cargarBonos('2026-10-14')).toEqual({ ok: false });
  });

  it('un paciente sin nombre visible se rotula «Paciente no encontrado»', async () => {
    comoRol('tecnico_administrativo', {
      bonos_consumo: { data: [filaVista(B1, PAC1, 5, 3)], error: null },
      bonos: { data: [{ id: B1, importe: '150.00', creado_en: '2026-10-01T10:00:00Z' }], error: null },
      pacientes: { data: [], error: null },
    });
    const r = await cargarBonos('2026-10-14');
    expect(r.ok && r.bonos[0].nombre).toBe(t('bonos.pacienteDesconocido'));
  });
});

describe('cargarContextoBonos · filtros', () => {
  it('administrador: lee estado, profesional y paciente', async () => {
    comoRol('administrador');
    const c = await cargarContextoBonos(Promise.resolve({ estado: 'agotado', profesional: PRO, paciente: PAC1, pagina: '3' }));
    expect(c).toMatchObject({ rol: 'administrador', estado: 'agotado', profesional: PRO, paciente: PAC1, pagina: 3 });
  });

  it.each(['profesional_sanitario', 'tecnico_administrativo'])(
    '%s: ignora ?profesional y ?paciente, conserva ?estado',
    async (rol) => {
      comoRol(rol);
      const c = await cargarContextoBonos(Promise.resolve({ estado: 'caducado', profesional: PRO, paciente: PAC1 }));
      expect(c.profesional).toBeNull();
      expect(c.paciente).toBeNull();
      expect(c.estado).toBe('caducado');
    },
  );

  it.each([['otro'], [['vigente', 'agotado']], [undefined]])('?estado=%j → todos', async (valor) => {
    comoRol('administrador');
    expect((await cargarContextoBonos(Promise.resolve({ estado: valor }))).estado).toBeNull();
  });

  it.each([['no-uuid'], [[PRO, PAC1]], [undefined]])('administrador con ?profesional=%j → sin filtro', async (valor) => {
    comoRol('administrador');
    expect((await cargarContextoBonos(Promise.resolve({ profesional: valor }))).profesional).toBeNull();
  });

  it.each([['0'], ['-2'], ['x'], [undefined]])('?pagina=%j → 1', async (valor) => {
    comoRol('administrador');
    expect((await cargarContextoBonos(Promise.resolve({ pagina: valor }))).pagina).toBe(1);
  });

  it('hoy sale de la zona de la organización', async () => {
    const falso = comoRol('administrador', {}, 'Atlantic/Canary');
    const c = await cargarContextoBonos(Promise.resolve({}));
    expect(c.zona).toBe('Atlantic/Canary');
    expect(falso.supabase.rpc).toHaveBeenCalledWith('zona_horaria_centro', { p_centro_id: null });
    expect(c.hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('cargarProfesionalesDeBonos', () => {
  it('lee los nombres del directorio y, sin ids, no consulta', async () => {
    const { llamadas } = comoRol('administrador', {
      directorio_perfiles: { data: [{ id: PRO, nombre_completo: 'Dra. Pérez' }], error: null },
    });
    expect(await cargarProfesionalesDeBonos([])).toEqual({ ok: true, opciones: [] });
    expect(llamadas.directorio_perfiles).toBeUndefined();
    expect(await cargarProfesionalesDeBonos([PRO, PRO])).toEqual({ ok: true, opciones: [{ id: PRO, nombre: 'Dra. Pérez' }] });
  });

  it('un error del directorio es { ok: false }', async () => {
    comoRol('administrador', { directorio_perfiles: { data: null, error: { code: 'XX000' } } });
    expect(await cargarProfesionalesDeBonos([PRO])).toEqual({ ok: false });
  });
});
