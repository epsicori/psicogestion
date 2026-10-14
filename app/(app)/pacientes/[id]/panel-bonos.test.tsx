import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

import { leerBono } from '../../facturacion/bonos/estado';

const cargarBonos = vi.fn();
const cargarRelojDeBonos = vi.fn();
const pacienteAdmiteBonos = vi.fn();
vi.mock('../../facturacion/bonos/datos', () => ({
  cargarBonos: (...a: unknown[]) => cargarBonos(...a),
  cargarRelojDeBonos: () => cargarRelojDeBonos(),
  pacienteAdmiteBonos: (...a: unknown[]) => pacienteAdmiteBonos(...a),
}));
const cargarPaciente = vi.fn();
vi.mock('./datos', () => ({ cargarPaciente: (...a: unknown[]) => cargarPaciente(...a) }));
const registrarBono = vi.fn((_: unknown) => null as ReactNode);
vi.mock('../../facturacion/bonos/registrar-bono', () => ({
  RegistrarBono: (props: unknown) => {
    registrarBono(props);
    return <button type="button">Registrar bono</button>;
  },
}));

const { PanelBonos } = await import('./panel-bonos');

const PAC = '6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60';
const HOY = '2026-10-14';

function bono(id: string, totales: number, consumidas: number, caducidad: string | null = null) {
  return {
    bonoId: id,
    pacienteId: PAC,
    nombre: 'Ana',
    apellidos: 'Gil',
    profesionalId: null,
    sesionesTotales: totales,
    sesionesConsumidas: consumidas,
    caducidad,
    importe: 15000,
    creadoEn: `2026-10-0${id}T10:00:00Z`,
    lectura: leerBono({ sesionesTotales: totales, sesionesConsumidas: consumidas, caducidad }, HOY),
  };
}

async function pintar() {
  render(await PanelBonos({ pacienteId: PAC }));
}

beforeEach(() => {
  registrarBono.mockClear();
  cargarRelojDeBonos.mockReset().mockResolvedValue({ hoy: HOY, zona: 'Europe/Madrid' });
  cargarPaciente.mockReset().mockResolvedValue({ id: PAC, nombre: 'Ana', apellidos: 'Gil' });
  pacienteAdmiteBonos.mockReset().mockResolvedValue(true);
  cargarBonos.mockReset().mockResolvedValue({ ok: true, bonos: [] });
});

describe('PanelBonos', () => {
  it('pide los bonos de ese paciente con el «hoy» de la organización', async () => {
    await pintar();
    expect(cargarBonos).toHaveBeenCalledWith(HOY, PAC);
  });

  it('sin bonos: vacío explicado, y el botón de registrar con el paciente ya elegido', async () => {
    await pintar();
    expect(screen.getByText(t('bonos.ficha.vacio'))).toBeInTheDocument();
    expect(screen.getByText(t('bonos.ficha.vacioExplicacion'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar bono' })).toBeInTheDocument();
    expect(registrarBono).toHaveBeenCalledWith(
      expect.objectContaining({ pacienteFijo: { id: PAC, nombre: 'Ana Gil' }, hoy: HOY }),
    );
  });

  it('paciente fusionado: se ven sus bonos pero no se ofrece registrar otro', async () => {
    pacienteAdmiteBonos.mockResolvedValue(false);
    cargarBonos.mockResolvedValue({ ok: true, bonos: [bono('1', 5, 1)] });
    await pintar();
    expect(screen.queryByRole('button', { name: 'Registrar bono' })).toBeNull();
    expect(screen.getByText('1 de 5 sesiones usadas')).toBeInTheDocument();
  });

  it('un bono vigente con saldo holgado: estado y saldo, sin aviso', async () => {
    cargarBonos.mockResolvedValue({ ok: true, bonos: [bono('1', 10, 2)] });
    await pintar();
    const fila = screen.getByRole('listitem');
    expect(within(fila).getByText(t('bonos.estado.vigente'))).toBeInTheDocument();
    expect(fila).toHaveTextContent('Quedan 8 sesiones');
    expect(within(fila).queryByText(/de este bono|caduca el/i)).toBeNull();
  });

  it('con 2 sesiones o menos: aviso en plural y en singular', async () => {
    cargarBonos.mockResolvedValue({ ok: true, bonos: [bono('1', 5, 3), bono('2', 5, 4)] });
    await pintar();
    expect(screen.getByText('Quedan 2 sesiones de este bono.')).toBeInTheDocument();
    expect(screen.getByText(t('bonos.avisoPocas.una'))).toBeInTheDocument();
  });

  it('con la caducidad a 30 días o menos: aviso con la fecha', async () => {
    cargarBonos.mockResolvedValue({ ok: true, bonos: [bono('1', 10, 1, '2026-11-01')] });
    await pintar();
    expect(screen.getByText('Este bono caduca el 01/11/2026.')).toBeInTheDocument();
  });

  it('agotado: dice qué hacer y no avisa', async () => {
    cargarBonos.mockResolvedValue({ ok: true, bonos: [bono('1', 5, 5)] });
    await pintar();
    expect(screen.getByText(t('bonos.estado.agotado'))).toBeInTheDocument();
    expect(screen.getByText(t('bonos.agotadoQueHacer'))).toBeInTheDocument();
    expect(screen.queryByText(/de este bono\./)).toBeNull();
  });

  it('caducado: la fecha y las sesiones sin usar', async () => {
    cargarBonos.mockResolvedValue({ ok: true, bonos: [bono('1', 6, 2, '2026-09-30')] });
    await pintar();
    expect(screen.getByText(t('bonos.estado.caducado'))).toBeInTheDocument();
    expect(screen.getByText(/caducó el 30\/09\/2026 con 4 sesiones sin usar/)).toBeInTheDocument();
  });

  it('el aviso va bajo SU bono, no bajo otro', async () => {
    cargarBonos.mockResolvedValue({ ok: true, bonos: [bono('1', 10, 1), bono('2', 5, 4)] });
    await pintar();
    const filas = screen.getAllByRole('listitem');
    const conAviso = filas.filter((f) => within(f).queryByText(t('bonos.avisoPocas.una')));
    expect(conAviso).toHaveLength(1);
    expect(conAviso[0]).toHaveTextContent('4 de 5 sesiones usadas');
  });

  it('sin campana, sin facturar, sin botones por bono', async () => {
    cargarBonos.mockResolvedValue({ ok: true, bonos: [bono('1', 5, 4)] });
    await pintar();
    expect(screen.queryByText(/factur/i)).toBeNull();
    expect(within(screen.getByRole('listitem')).queryByRole('button')).toBeNull();
  });

  it('si la lectura falla: aviso, no un vacío que parezca verdad', async () => {
    cargarBonos.mockResolvedValue({ ok: false });
    await pintar();
    expect(screen.getByText(t('bonos.ficha.error'))).toBeInTheDocument();
    expect(screen.queryByText(t('bonos.ficha.vacio'))).toBeNull();
  });
});
