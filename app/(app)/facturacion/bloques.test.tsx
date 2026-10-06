import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatearImporte as formatear } from '@/lib/dinero/importe';
import { t, tCon as tConCrudo } from '@/lib/i18n';

// Intl separa el € con un espacio duro; Testing Library lo normaliza en el DOM pero no en la
// cadena buscada. Se normaliza aquí igual.
const llano = (s: string) => s.replace(/\s+/g, ' ');
const formatearImporte = (c: number) => llano(formatear(c));
const tCon = (...a: Parameters<typeof tConCrudo>) => llano(tConCrudo(...a));

const cargarContexto = vi.fn();
const cargarPendientes = vi.fn();
const cargarCobrosRecientes = vi.fn();
vi.mock('./datos', () => ({
  cargarContexto: (...a: unknown[]) => cargarContexto(...a),
  cargarPendientes: (...a: unknown[]) => cargarPendientes(...a),
  cargarCobrosRecientes: (...a: unknown[]) => cargarCobrosRecientes(...a),
}));

const { BloqueCobros, BloqueMetrica, BloquePendientes } = await import('./bloques');

const PARAMETROS = Promise.resolve({});
const PRO = '1b2c3d4e-5f60-4a71-8b82-9c0d1e2f3a40';

type Fila = {
  pacienteId: string;
  nombre: string;
  apellidos: string;
  estado: 'pendiente' | 'cobrado' | 'cobrado_de_mas';
  parcial: boolean;
  pendiente: number;
  excedente: number;
  cobrado: number;
  citasSinTarifa: number;
};

const DE_MAS: Fila = {
  pacienteId: 'p-b',
  nombre: 'Bea',
  apellidos: 'Sanz',
  estado: 'cobrado_de_mas',
  parcial: false,
  pendiente: 0,
  excedente: 1000,
  cobrado: 11000,
  citasSinTarifa: 0,
};
const PARCIAL: Fila = {
  pacienteId: 'p-a',
  nombre: 'Ana',
  apellidos: 'Ruiz',
  estado: 'pendiente',
  parcial: true,
  pendiente: 4000,
  excedente: 0,
  cobrado: 6000,
  citasSinTarifa: 2,
};
const AL_DIA: Fila = { ...PARCIAL, pacienteId: 'p-c', nombre: 'Carla', apellidos: 'Vidal', estado: 'cobrado', parcial: false, pendiente: 0, citasSinTarifa: 0 };

/** Un Server Component async se invoca a mano y se pinta lo que devuelve. */
async function pintar(componente: (p: { searchParams: typeof PARAMETROS }) => Promise<React.ReactNode>) {
  render(<>{await componente({ searchParams: PARAMETROS })}</>);
}

beforeEach(() => {
  cargarContexto.mockReset().mockResolvedValue({ rol: 'administrador', profesionalFiltrado: PRO, zona: 'Europe/Madrid', hoy: '2026-10-06' });
  cargarPendientes.mockReset();
  cargarCobrosRecientes.mockReset();
});

describe('BloqueMetrica', () => {
  it('la cifra es la suma de lo pendiente, con el filtro del contexto, y señala los cobros de más', async () => {
    cargarPendientes.mockResolvedValue({ ok: true, filas: [DE_MAS, PARCIAL, AL_DIA] });

    await pintar(BloqueMetrica);

    expect(cargarPendientes).toHaveBeenCalledWith(PRO);
    expect(screen.getByText(t('cobros.pendienteDeCobro'))).toBeInTheDocument();
    expect(screen.getByText(formatearImporte(4000))).toBeInTheDocument();
    expect(screen.getByText(tCon('cobros.pacientesConPendiente.una', { n: 1 }))).toBeInTheDocument();
    expect(screen.getByText(tCon('cobros.conCobrosDeMas', { n: 1 }))).toBeInTheDocument();
  });

  it('sin cobros de más no hay segunda línea', async () => {
    cargarPendientes.mockResolvedValue({ ok: true, filas: [PARCIAL, { ...PARCIAL, pacienteId: 'p-d' }] });

    await pintar(BloqueMetrica);

    expect(screen.getByText(tCon('cobros.pacientesConPendiente.varias', { n: 2 }))).toBeInTheDocument();
    expect(screen.queryByText(/con cobros de más/)).toBeNull();
  });

  it('si la carga falla, el aviso de error y ninguna cifra', async () => {
    cargarPendientes.mockResolvedValue({ ok: false });
    await pintar(BloqueMetrica);
    expect(screen.getByText(t('cobros.errorPendientes'))).toBeInTheDocument();
    expect(screen.queryByText(/€/)).toBeNull();
  });
});

describe('BloquePendientes', () => {
  it('pinta lo cobrado de más primero, con su aviso, y cada fila con su píldora', async () => {
    cargarPendientes.mockResolvedValue({ ok: true, filas: [DE_MAS, PARCIAL, AL_DIA] });

    await pintar(BloquePendientes);

    const filas = screen.getAllByRole('listitem');
    expect(filas).toHaveLength(3);
    expect(within(filas[0]).getByText('Bea Sanz')).toBeInTheDocument();
    expect(
      within(filas[0]).getByText(tCon('cobros.cobradoDeMasRevisa', { importe: formatearImporte(1000) })),
    ).toBeInTheDocument();
    expect(within(filas[0]).getByText(t('cobros.pildora.cobradoDeMas'))).toBeInTheDocument();

    expect(
      within(filas[1]).getByText(
        tCon('cobros.debeYHaPagado', { debe: formatearImporte(4000), pagado: formatearImporte(6000) }),
      ),
    ).toBeInTheDocument();
    expect(within(filas[1]).getByText(t('cobros.pildora.parcial'))).toBeInTheDocument();
    expect(within(filas[1]).getByText(tCon('cobros.sesionesSinPrecio.varias', { n: 2 }))).toBeInTheDocument();

    expect(within(filas[2]).getByText(tCon('cobros.alDia', { pagado: formatearImporte(6000) }))).toBeInTheDocument();
    expect(within(filas[2]).getByText(t('cobros.pildora.cobrado'))).toBeInTheDocument();
    expect(within(filas[2]).queryByText(/sin precio/)).toBeNull();
  });

  it('una sola sesión sin precio, en singular', async () => {
    cargarPendientes.mockResolvedValue({ ok: true, filas: [{ ...PARCIAL, citasSinTarifa: 1 }] });
    await pintar(BloquePendientes);
    expect(screen.getByText(tCon('cobros.sesionesSinPrecio.una', { n: 1 }))).toBeInTheDocument();
  });

  it('sin filas, el estado vacío', async () => {
    cargarPendientes.mockResolvedValue({ ok: true, filas: [] });
    await pintar(BloquePendientes);
    expect(screen.getByText(t('cobros.nadaPendiente'))).toBeInTheDocument();
  });

  it('si la carga falla, el aviso de error', async () => {
    cargarPendientes.mockResolvedValue({ ok: false });
    await pintar(BloquePendientes);
    expect(screen.getByText(t('cobros.errorPendientes'))).toBeInTheDocument();
  });

  it('ninguna fila lleva botones ni menús', async () => {
    cargarPendientes.mockResolvedValue({ ok: true, filas: [DE_MAS, PARCIAL, AL_DIA] });
    await pintar(BloquePendientes);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });
});

describe('BloqueCobros', () => {
  const COBROS = [
    {
      id: 'c-2',
      pacienteId: 'p-a',
      nombre: 'Ana',
      apellidos: 'Ruiz',
      importe: -2000,
      fecha: '2026-10-05',
      formaPago: 'bizum',
      referencia: null,
      motivo: 'Sesión cobrada dos veces',
    },
    {
      id: 'c-1',
      pacienteId: 'p-a',
      nombre: 'Ana',
      apellidos: 'Ruiz',
      importe: 6000,
      fecha: '2026-10-01',
      formaPago: 'transferencia',
      referencia: 'TR-9',
      motivo: null,
    },
  ];

  it('cada cobro con su fecha, forma de pago e importe; la devolución, con su motivo', async () => {
    cargarCobrosRecientes.mockResolvedValue({ ok: true, cobros: COBROS });

    await pintar(BloqueCobros);

    expect(cargarCobrosRecientes).toHaveBeenCalledWith(PRO);
    const filas = screen.getAllByRole('listitem');
    expect(filas).toHaveLength(2);
    expect(within(filas[0]).getByText(/05\/10\/2026/)).toBeInTheDocument();
    expect(within(filas[0]).getByText(formatearImporte(-2000))).toBeInTheDocument();
    expect(
      within(filas[0]).getByText(tCon('cobros.devolucionConMotivo', { motivo: 'Sesión cobrada dos veces' })),
    ).toBeInTheDocument();
    expect(within(filas[0]).getByText(new RegExp(t('cobros.formas.bizum')))).toBeInTheDocument();
    expect(within(filas[1]).getByText(formatearImporte(6000))).toBeInTheDocument();
    expect(within(filas[1]).queryByText(/Devolución/)).toBeNull();
  });

  it('ninguna fila de cobros lleva botón ni menú: no se editan, no se borran, no se anulan', async () => {
    cargarCobrosRecientes.mockResolvedValue({ ok: true, cobros: COBROS });
    await pintar(BloqueCobros);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('sin cobros, el estado vacío; con fallo, el aviso', async () => {
    cargarCobrosRecientes.mockResolvedValue({ ok: true, cobros: [] });
    await pintar(BloqueCobros);
    expect(screen.getByText(t('cobros.sinCobros'))).toBeInTheDocument();
  });

  it('si la carga falla, el aviso de error', async () => {
    cargarCobrosRecientes.mockResolvedValue({ ok: false });
    await pintar(BloqueCobros);
    expect(screen.getByText(t('cobros.errorCobros'))).toBeInTheDocument();
  });
});
