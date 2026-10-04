import { beforeEach, describe, expect, it, vi } from 'vitest';

// T-040 · P2-a: `abrirPestanaDeHistoria` añade, en la pestaña de notas, las que la
// administración solo puede pedir por motivo. Se leen DESPUÉS del registro del acceso, como
// la lista de notas: si el registro falla, no se lee nada.

const sesion = { supabase: {}, usuario: { id: 'u1' } };
const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const cabeceras = new Headers({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'prueba/1' });
vi.mock('next/headers', () => ({ headers: async () => cabeceras }));

const orden: string[] = [];
const registrarAccesoHistoria = vi.fn();
vi.mock('@/lib/cuentas/accesos', () => ({
  registrarAccesoHistoria: (...a: unknown[]) => {
    orden.push('registro');
    return registrarAccesoHistoria(...a);
  },
}));
vi.mock('@/lib/cuentas/candado', () => ({
  estadoDeCuenta: async () => ({ desbloqueoCaducaEn: '2026-10-04T10:00:00Z' }),
  bloquearHistoria: vi.fn(),
  prolongarDesbloqueo: vi.fn(),
}));
const listarNotasDelPaciente = vi.fn();
vi.mock('@/lib/notas/servidor', () => ({
  listarNotasDelPaciente: (...a: unknown[]) => {
    orden.push('notas');
    return listarNotasDelPaciente(...a);
  },
}));
const notasParaCopia = vi.fn();
vi.mock('@/lib/exportaciones/servidor', () => ({
  notasParaCopia: (...a: unknown[]) => {
    orden.push('paraCopia');
    return notasParaCopia(...a);
  },
}));

const { abrirPestanaDeHistoria } = await import('./acciones');

const P = '11111111-1111-4111-8111-111111111111';
const paraCopia = [
  { id: 'n9', fechaSesion: '02/02/2026', autor: 'Dr. Ruiz', versiones: 2, href: `/pacientes/${P}/historia/notas?nota=n9` },
];

beforeEach(() => {
  vi.clearAllMocks();
  orden.length = 0;
  exigirSesion.mockResolvedValue(sesion);
  registrarAccesoHistoria.mockResolvedValue({ ok: true, vistas: 1 });
  listarNotasDelPaciente.mockResolvedValue({ ok: true, valor: [] });
  notasParaCopia.mockResolvedValue({ ok: true, valor: paraCopia });
});

describe('abrirPestanaDeHistoria · notasParaCopia', () => {
  it('en notas_clinicas devuelve las notas para copia, leídas después del registro', async () => {
    const r = await abrirPestanaDeHistoria(P, 'notas_clinicas');
    expect(r.abierta).toBe(true);
    if (!r.abierta) return;
    expect(r.notasParaCopia).toEqual(paraCopia);
    expect(notasParaCopia).toHaveBeenCalledWith(sesion, P);
    expect(orden.indexOf('registro')).toBe(0);
    expect(orden).toContain('paraCopia');
  });

  it('si el registro del acceso falla no se leen', async () => {
    registrarAccesoHistoria.mockResolvedValue({ ok: false });
    const r = await abrirPestanaDeHistoria(P, 'notas_clinicas');
    expect(r.abierta).toBe(false);
    expect(notasParaCopia).not.toHaveBeenCalled();
  });

  it('si la lectura falla es null, no una lista vacía', async () => {
    notasParaCopia.mockResolvedValue({ ok: false });
    const r = await abrirPestanaDeHistoria(P, 'notas_clinicas');
    expect(r.abierta && r.notasParaCopia).toBeNull();
  });

  it('en otra pestaña es null y no se consulta', async () => {
    const r = await abrirPestanaDeHistoria(P, 'informes');
    expect(r.abierta && r.notasParaCopia).toBeNull();
    expect(notasParaCopia).not.toHaveBeenCalled();
  });
});
