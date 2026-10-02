import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const PACIENTE = '11111111-1111-4111-8111-111111111111';
const CITA = '33333333-3333-4333-8333-333333333333';

const lecturaDeCita = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/supabase/sesion', () => ({
  exigirSesion: async () => ({
    supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => lecturaDeCita() }) }) }) },
  }),
}));
vi.mock('../../datos', () => ({
  cargarPaciente: async () => ({ id: PACIENTE, nombre: 'Carmen', apellidos: 'Ruiz' }),
}));
vi.mock('./editor-de-nota', () => ({ EditorDeNota: () => null }));

/**
 * El armazón de la ruta no puede leer nada clínico: lo clínico se abre con un gesto y deja su
 * acceso. Se comprueba sobre el FUENTE, que es lo que decide qué viaja en el HTML del servidor.
 */
const fuente = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

/** Recorre el árbol de elementos devuelto por un Server Component, sin renderizarlo. */
function recoger(nodo: unknown, salida: { tipo: unknown; props: Record<string, unknown> }[] = []) {
  if (Array.isArray(nodo)) nodo.forEach((n) => recoger(n, salida));
  else if (nodo && typeof nodo === 'object' && 'props' in nodo) {
    const el = nodo as { type: unknown; props: Record<string, unknown> };
    salida.push({ tipo: el.type, props: el.props });
    recoger(el.props.children, salida);
  }
  return salida;
}

async function armazon() {
  const { default: Pagina } = await import('./page');
  const suspense = Pagina({
    params: Promise.resolve({ id: PACIENTE }),
    searchParams: Promise.resolve({ cita: CITA }),
  }) as { props: { children: { type: (p: unknown) => Promise<unknown>; props: unknown } } };
  const hijo = suspense.props.children;
  return hijo.type(hijo.props);
}

describe('page.tsx de la nota · error leyendo la cita (B0-H7)', () => {
  it('un error de lectura de la cita NO es un 404: pinta el aviso de que no se pudo abrir y ni rastro del editor', async () => {
    lecturaDeCita.mockResolvedValue({ data: null, error: { code: '57014', message: 'lectura rota' } });
    const arbol = recoger(await armazon());
    expect(arbol.some((e) => e.props.mensaje === 'No se pudo abrir la nota. Vuelve a intentarlo.')).toBe(true);
    expect(arbol.some((e) => 'notaId' in e.props && 'pacienteId' in e.props)).toBe(false);
  });

  it('una cita que no se ve (sin error) sigue siendo un 404', async () => {
    lecturaDeCita.mockResolvedValue({ data: null, error: null });
    await expect(armazon()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('page.tsx de la nota (armazón)', () => {
  it('no menciona la tabla de notas clínicas', () => {
    expect(fuente).not.toContain('notas_clinicas');
  });

  it('no importa el servidor de notas', () => {
    expect(fuente).not.toContain('lib/notas/servidor');
  });

  it('no importa las acciones de la nota: el editor las importa por su cuenta', () => {
    expect(fuente).not.toMatch(/from\s+['"]\.\/acciones['"]/);
  });

  it('no usa `use cache` (ADR-043)', () => {
    expect(fuente).not.toMatch(/['"]use cache/);
  });

  it('exporta el viewport con interactiveWidget resizes-content', () => {
    expect(fuente).toMatch(/export const viewport[^=]*=\s*\{\s*interactiveWidget:\s*'resizes-content'\s*\}/);
  });

  it('el trabajo asíncrono va bajo Suspense con el esqueleto', () => {
    expect(fuente).toContain('<Suspense fallback={<EsqueletoEditor />}>');
  });
});
