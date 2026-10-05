import { describe, expect, it, vi } from 'vitest';

import { cargarAltas, construirPersonas } from './carga';

/**
 * T-041 ronda 2. `perfiles` solo deja leer la fila propia (`perfiles_lectura_propia`): leerla
 * desde esta pantalla le enseñaba al administrador una lista de una sola persona. Las
 * personas salen de `directorio_perfiles`. Estas pruebas fallan si alguien vuelve a leer
 * `perfiles`, si un error de lectura se pinta como lista vacía, o si `tienePrincipal` se
 * calcula con «tiene alguna alta» en vez de «tiene un alta principal vigente».
 */
const NORTE = 'c0000001-0000-4000-8000-000000000001';
const SUR = 'c0000001-0000-4000-8000-000000000002';
const ESTE = 'c0000001-0000-4000-8000-000000000003';
const PAU = 'a0000001-0000-4000-8000-000000000001';
const ADA = 'a0000001-0000-4000-8000-000000000002';

type Respuesta = { data: unknown; error: unknown };

/** Un cliente simulado que apunta qué tablas se leen y con qué filtros. */
function clienteSimulado(respuestas: Record<string, Respuesta>) {
  const leidas: string[] = [];
  const filtros: Record<string, [string, ...unknown[]][]> = {};
  const from = vi.fn((tabla: string) => {
    leidas.push(tabla);
    filtros[tabla] = [];
    const resultado = respuestas[tabla] ?? { data: null, error: null };
    const cadena: Record<string, unknown> = {};
    for (const metodo of ['select', 'eq', 'in', 'is', 'order']) {
      cadena[metodo] = (...args: unknown[]) => {
        filtros[tabla].push([metodo, ...args]);
        return cadena;
      };
    }
    cadena.maybeSingle = () => Promise.resolve(resultado);
    cadena.then = (alResolver: (r: Respuesta) => unknown) => Promise.resolve(resultado).then(alResolver);
    return cadena;
  });
  return { supabase: { from } as never, leidas, filtros };
}

const DIRECTORIO = [
  { id: ADA, nombre_completo: 'Ada Administradora', rol: 'administrador', estado: 'activo', centro_id: null },
  { id: PAU, nombre_completo: 'Pau Profesional', rol: 'profesional_sanitario', estado: 'activo', centro_id: NORTE },
];
const CENTROS = [
  { id: ESTE, nombre: 'Centro Este', activo: true },
  { id: NORTE, nombre: 'Centro Norte', activo: true },
  { id: SUR, nombre: 'Centro Sur', activo: false },
];
const ALTAS = [
  { id: 'x1', perfil_id: PAU, centro_id: NORTE, principal: true, desde: '2026-09-01' },
  { id: 'x2', perfil_id: PAU, centro_id: SUR, principal: false, desde: '2026-09-15' },
];

describe('cargarAltas (T-041, criterio 8)', () => {
  it('lee las personas de directorio_perfiles y nunca de perfiles, con estado activo y los dos roles', async () => {
    const { supabase, leidas, filtros } = clienteSimulado({
      directorio_perfiles: { data: DIRECTORIO, error: null },
      perfiles_centros: { data: ALTAS, error: null },
      centros: { data: CENTROS, error: null },
      organizacion: { data: { zona_horaria: 'Europe/Madrid' }, error: null },
    });

    const r = await cargarAltas(supabase);

    expect(leidas).toContain('directorio_perfiles');
    expect(leidas).not.toContain('perfiles');
    expect(filtros.directorio_perfiles).toContainEqual(['eq', 'estado', 'activo']);
    expect(filtros.directorio_perfiles).toContainEqual([
      'in',
      'rol',
      ['profesional_sanitario', 'administrador'],
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.personas.map((p) => p.nombre)).toEqual(['Ada Administradora', 'Pau Profesional']);
    expect(r.personas[1].altas.map((a) => [a.nombre, a.desde, a.principal])).toEqual([
      ['Centro Norte', '01/09/2026', true],
      ['Centro Sur', '15/09/2026', false],
    ]);
    // Solo los centros abiertos se ofrecen; el cerrado sigue dando nombre a su alta.
    expect(r.centros).toEqual([
      { valor: ESTE, etiqueta: 'Centro Este' },
      { valor: NORTE, etiqueta: 'Centro Norte' },
    ]);
  });

  it.each(['directorio_perfiles', 'perfiles_centros', 'centros'])(
    'un error al leer %s es un error, no una lista vacía',
    async (tabla) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const respuestas: Record<string, Respuesta> = {
        directorio_perfiles: { data: DIRECTORIO, error: null },
        perfiles_centros: { data: ALTAS, error: null },
        centros: { data: CENTROS, error: null },
        organizacion: { data: { zona_horaria: 'Europe/Madrid' }, error: null },
      };
      respuestas[tabla] = { data: null, error: { message: 'caída' } };
      const { supabase } = clienteSimulado(respuestas);

      const r = await cargarAltas(supabase);

      expect(r).toEqual({ ok: false });
    },
  );
});

describe('construirPersonas (T-041, B-H6)', () => {
  const zona = 'Europe/Madrid';
  const directorio = [{ id: PAU, nombre_completo: 'Pau Profesional', rol: 'profesional_sanitario' }];
  const nombres = new Map([
    [NORTE, 'Centro Norte'],
    [SUR, 'Centro Sur'],
  ]);

  it('con un alta principal vigente, tienePrincipal es true', () => {
    const [pau] = construirPersonas(directorio, ALTAS, nombres, zona);
    expect(pau.tienePrincipal).toBe(true);
  });

  it('estado D5: se retiró el principal y le quedan otras altas, tienePrincipal es false', () => {
    const [pau] = construirPersonas(
      directorio,
      [{ perfil_id: PAU, centro_id: SUR, principal: false, desde: '2026-09-15' }],
      nombres,
      zona,
    );
    expect(pau.altas).toHaveLength(1);
    expect(pau.tienePrincipal).toBe(false);
  });
});
