import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cargarPerfilesActivos } from './perfiles-activos';

// Cliente simulado: apunta las tablas leídas y los filtros aplicados. Patrón copiado de
// `centros/carga.test.ts` (rama de T-041); unificarlos cuando ambos estén en `main` no entra
// en T-045.
type Respuesta = { data: unknown; error: { message: string } | null };

function clienteSimulado(respuestas: Record<string, Respuesta>) {
  const leidas: string[] = [];
  const filtros: unknown[][] = [];
  const supabase = {
    from(tabla: string) {
      leidas.push(tabla);
      const resultado = respuestas[tabla] ?? { data: [], error: null };
      const cadena = {
        select: () => cadena,
        eq: (columna: string, valor: unknown) => {
          filtros.push(['eq', columna, valor]);
          return cadena;
        },
        order: () => Promise.resolve(resultado),
      };
      return cadena;
    },
  };
  return { supabase: supabase as never, leidas, filtros };
}

const PROPIO = 'b0080001-0000-4000-8000-000000000001';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cargarPerfilesActivos', () => {
  it('C1: lee solo directorio_perfiles, filtra por activo y descarta al propio', async () => {
    const { supabase, leidas, filtros } = clienteSimulado({
      directorio_perfiles: {
        data: [
          { id: 'a', nombre_completo: 'Ana' },
          { id: PROPIO, nombre_completo: 'Álvaro' },
          { id: 'b', nombre_completo: 'Bruno' },
        ],
        error: null,
      },
    });

    const carga = await cargarPerfilesActivos(supabase, PROPIO);

    expect(leidas).toEqual(['directorio_perfiles']);
    expect(filtros).toContainEqual(['eq', 'estado', 'activo']);
    expect(carga).toEqual({
      ok: true,
      perfiles: [
        { valor: 'a', etiqueta: 'Ana' },
        { valor: 'b', etiqueta: 'Bruno' },
      ],
    });
  });

  it('C2: ante un error de lectura devuelve { ok: false }', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { supabase } = clienteSimulado({
      directorio_perfiles: { data: null, error: { message: 'caída' } },
    });

    expect(await cargarPerfilesActivos(supabase, PROPIO)).toEqual({ ok: false });
  });

  it('C3: descarta filas con id o nombre_completo nulos', async () => {
    const { supabase } = clienteSimulado({
      directorio_perfiles: {
        data: [
          { id: null, nombre_completo: 'Sin id' },
          { id: 'x', nombre_completo: null },
          { id: 'ok', nombre_completo: 'Con todo' },
        ],
        error: null,
      },
    });

    expect(await cargarPerfilesActivos(supabase, PROPIO)).toEqual({
      ok: true,
      perfiles: [{ valor: 'ok', etiqueta: 'Con todo' }],
    });
  });
});

describe('C4: las páginas no esquivan el cargador', () => {
  for (const carpeta of ['dar-de-baja', 'reponer-totp']) {
    it(`${carpeta}/page.tsx usa cargarPerfilesActivos y no lee perfiles`, () => {
      const fuente = readFileSync(join(__dirname, carpeta, 'page.tsx'), 'utf8');
      expect(fuente).not.toMatch(/\.from\(\s*['"]perfiles['"]\s*\)/);
      expect(fuente).toContain('cargarPerfilesActivos(');
    });
  }
});
