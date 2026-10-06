import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BloqueAlta } from '@/lib/citas/alta';
import type { Sesion } from '@/lib/citas/tipos';

const m = vi.hoisted(() => ({ leerBloques: vi.fn(), leerUltimasCitasPaciente: vi.fn() }));

vi.mock('@/lib/citas/alta', () => ({
  leerBloques: m.leerBloques,
  leerUltimasCitasPaciente: m.leerUltimasCitasPaciente,
}));
vi.mock('@/lib/citas/agenda', () => ({ zonaDeCentro: vi.fn() }));

import { cargarVistaAlta, type EntradaVistaAlta } from './estado-alta';

const sesion = {} as Sesion;
// El 4 de octubre de 2026 es domingo: su semana es del 28 de septiembre al 4 de octubre.
const BASE: EntradaVistaAlta = {
  pacienteId: null,
  profesionalId: 'pro',
  centroId: 'centro',
  duracionMinutos: 50,
  fechaFoco: null,
  excluir: [],
  zona: 'Europe/Madrid',
  hoy: '2026-10-04',
};

function libre(fecha: string, horaLocal: string): BloqueAlta {
  const [h, mi] = horaLocal.split(':').map(Number);
  const inicio = new Date(`${fecha}T${String(h - 2).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00Z`);
  return { fecha, horaLocal, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(), estado: 'libre' };
}

/** La base devuelve los bloques que caen en el rango pedido. */
function hayLibres(...bloques: BloqueAlta[]) {
  m.leerBloques.mockImplementation(async (_sesion: Sesion, entrada: { desde: string; hasta: string }) => ({
    ok: true,
    bloques: bloques.filter((b) => b.fecha >= entrada.desde && b.fecha <= entrada.hasta),
    huecosRaros: {},
  }));
}

/** Como `hayLibres`, y la base marca como raros los huecos de `raros` (clave → minutos) que caen en el rango. */
function hayLibresYRaros(bloques: BloqueAlta[], raros: Record<string, number>) {
  m.leerBloques.mockImplementation(async (_sesion: Sesion, entrada: { desde: string; hasta: string }) => ({
    ok: true,
    bloques: bloques.filter((b) => b.fecha >= entrada.desde && b.fecha <= entrada.hasta),
    huecosRaros: Object.fromEntries(
      Object.entries(raros).filter(([clave]) => clave.slice(0, 10) >= entrada.desde && clave.slice(0, 10) <= entrada.hasta),
    ),
  }));
}

async function cargar(extra: Partial<EntradaVistaAlta> = {}) {
  const r = await cargarVistaAlta(sesion, 'tecnico_administrativo', { ...BASE, ...extra });
  if (!r.ok) throw new Error(r.mensaje);
  return r.vista;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.leerUltimasCitasPaciente.mockResolvedValue({ ok: true, citas: [] });
});

// Observacion del verificador (ronda 3): sin huecos esta semana, el calendario abre donde esta la primera sugerencia.
describe('cargarVistaAlta · semana con la que abre el calendario', () => {
  it('sin fecha pedida y sin huecos en la semana de hoy, abre en la semana de la primera sugerencia', async () => {
    hayLibres(libre('2026-10-14', '10:00'), libre('2026-10-21', '10:00'));

    const vista = await cargar();

    expect(vista.tarjetas.length).toBeGreaterThan(0);
    expect(vista.calendario.desde).toBe('2026-10-12');
    expect(vista.calendario.huecos.some((h) => h.estado === 'libre')).toBe(true);
  });

  it('con una fecha pedida (?inicio=), se queda en ella aunque este vacia', async () => {
    hayLibres(libre('2026-10-14', '10:00'));

    const vista = await cargar({ fechaFoco: '2026-09-29' });

    expect(vista.calendario.desde).toBe('2026-09-28');
  });

  it('con huecos en la semana de hoy, abre en ella', async () => {
    hayLibres(libre('2026-10-04', '18:00'), libre('2026-10-14', '10:00'));

    const vista = await cargar();

    expect(vista.calendario.desde).toBe('2026-09-28');
  });

  it('sin ninguna sugerencia, abre en la semana de hoy', async () => {
    hayLibres();

    const vista = await cargar();

    expect(vista.calendario.desde).toBe('2026-09-28');
    expect(vista.tarjetas).toEqual([]);
  });
});

// T-043 · el hueco raro llega a la vista junto al calendario y las tarjetas.
describe('cargarVistaAlta · huecosRaros', () => {
  it('con una sola lectura, la vista lleva el mapa de la lectura y su clave es la de un hueco del calendario', async () => {
    hayLibresYRaros([libre('2026-10-06', '10:00'), libre('2026-10-06', '11:00')], { '2026-10-06T10:00': 40 });

    const vista = await cargar({ fechaFoco: '2026-10-06' });

    expect(m.leerBloques).toHaveBeenCalledTimes(1);
    expect(vista.huecosRaros).toEqual({ '2026-10-06T10:00': 40 });
    // Fija la forma de la clave (H6): la del mapa es la de un hueco pintado.
    expect(vista.calendario.huecos.map((h) => h.clave)).toContain('2026-10-06T10:00');
  });

  it('con dos lecturas (semana lejana y ventana), junta ambos mapas', async () => {
    hayLibresYRaros(
      [libre('2026-10-06', '10:00'), libre('2027-01-05', '10:00')],
      { '2026-10-06T10:00': 40, '2027-01-05T10:00': 25 },
    );

    const vista = await cargar({ fechaFoco: '2027-01-05' });

    expect(m.leerBloques).toHaveBeenCalledTimes(2);
    expect(vista.huecosRaros).toEqual({ '2026-10-06T10:00': 40, '2027-01-05T10:00': 25 });
    expect(vista.calendario.huecos.map((h) => h.clave)).toContain('2027-01-05T10:00');
  });
});
