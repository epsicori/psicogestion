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
