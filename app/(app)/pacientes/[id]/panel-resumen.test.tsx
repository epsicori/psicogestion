import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const datos = vi.hoisted(() => ({
  cargarCitasDelPaciente: vi.fn(),
  cargarAlertasDeDocumentacion: vi.fn(async () => []),
  cargarConsentimientos: vi.fn(async () => []),
}));
vi.mock('./datos', () => datos);

const { PanelResumen } = await import('./panel-resumen');

const ID = '11111111-1111-4111-8111-111111111111';

const CITA = {
  id: '22222222-2222-4222-8222-222222222222',
  inicio: '2026-10-20T08:00:00Z',
  fin: '2026-10-20T08:50:00Z',
  estado: 'programada',
  zonaHoraria: 'Europe/Madrid',
  sala: null,
};

async function pintar() {
  render(await PanelResumen({ pacienteId: ID }));
}

// T-028 C, man-1: la ficha enlaza al alta con el paciente fijado por uuid.
describe('PanelResumen · botón «Nueva cita»', () => {
  beforeEach(() => vi.clearAllMocks());

  it('con citas, enlaza a /agenda/nueva?paciente=<uuid>', async () => {
    datos.cargarCitasDelPaciente.mockResolvedValue([CITA]);
    await pintar();
    expect(screen.getByRole('link', { name: 'Nueva cita' })).toHaveAttribute(
      'href',
      `/agenda/nueva?paciente=${ID}`,
    );
  });

  it('sin citas también está: es donde más hace falta', async () => {
    datos.cargarCitasDelPaciente.mockResolvedValue([]);
    await pintar();
    expect(screen.getByRole('link', { name: 'Nueva cita' })).toHaveAttribute(
      'href',
      `/agenda/nueva?paciente=${ID}`,
    );
  });

  it('si la agenda no es visible (null), también se pinta (H37)', async () => {
    datos.cargarCitasDelPaciente.mockResolvedValue(null);
    await pintar();
    expect(screen.getByRole('link', { name: 'Nueva cita' })).toHaveAttribute(
      'href',
      `/agenda/nueva?paciente=${ID}`,
    );
  });
});
