import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResultadoDeApertura } from './acciones';

const abrirPestanaDeHistoria = vi.fn();
const cerrarHistoriaDelPaciente = vi.fn();
const ampliarLaVentana = vi.fn();

vi.mock('./acciones', () => ({
  abrirPestanaDeHistoria: (...argumentos: unknown[]) => abrirPestanaDeHistoria(...argumentos),
  cerrarHistoriaDelPaciente: () => cerrarHistoriaDelPaciente(),
  ampliarLaVentana: () => ampliarLaVentana(),
}));

// El formulario del PIN llama a la acción de `/candado`, que en servidor arrastra la
// configuración de Supabase. Aquí solo interesa que la pantalla de bloqueo lo pinte.
vi.mock('@/app/(app)/candado/acciones', () => ({ abrirHistoria: vi.fn() }));

const { PanelHistoria } = await import('./panel-historia');

const CONTENIDO = {
  episodios: [
    {
      id: 'e1',
      motivo: 'Ansiedad ante exámenes',
      modalidad: 'individual' as const,
      abiertoEn: '2026-01-10T09:00:00Z',
      cerradoEn: null,
      diagnosticos: [],
    },
  ],
  valoraciones: [],
};

function abierta(minutos: number, vistas = 1): ResultadoDeApertura {
  return {
    abierta: true,
    caducaEn: new Date(Date.now() + minutos * 60_000).toISOString(),
    vistas,
    historial: CONTENIDO,
  };
}

const BLOQUEADA: ResultadoDeApertura = {
  abierta: false,
  mensaje: 'No se pudo abrir esta historia.',
};

describe('PanelHistoria', () => {
  beforeEach(() => {
    abrirPestanaDeHistoria.mockReset();
    cerrarHistoriaDelPaciente.mockReset().mockResolvedValue({ cerradas: 1 });
    ampliarLaVentana.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin ventana abierta pinta la petición de PIN y NO el contenido clínico', async () => {
    abrirPestanaDeHistoria.mockResolvedValue(BLOQUEADA);
    render(<PanelHistoria pacienteId="11111111-1111-4111-8111-111111111111" />);

    expect(await screen.findByText('Esta historia está cerrada')).toBeInTheDocument();
    expect(screen.getByLabelText('PIN')).toBeInTheDocument();
    expect(screen.queryByText('Ansiedad ante exámenes')).not.toBeInTheDocument();
  });

  it('con ventana abierta pinta el historial que devolvió la acción', async () => {
    abrirPestanaDeHistoria.mockResolvedValue(abierta(15));
    render(<PanelHistoria pacienteId="11111111-1111-4111-8111-111111111111" />);

    expect(await screen.findByText('Ansiedad ante exámenes')).toBeInTheDocument();
    expect(abrirPestanaDeHistoria).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'historial_clinico',
    );
  });

  it('al agotarse la ventana pasa sola a la pantalla de bloqueo, sin tocar nada', async () => {
    // Es el criterio del ticket que no depende del usuario: una historia abierta y olvidada
    // en una mesa compartida deja de ser legible aunque nadie pulse ni recargue.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    abrirPestanaDeHistoria.mockResolvedValue(abierta(1));
    render(<PanelHistoria pacienteId="11111111-1111-4111-8111-111111111111" />);

    expect(await screen.findByText('Ansiedad ante exámenes')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    expect(screen.queryByText('Ansiedad ante exámenes')).not.toBeInTheDocument();
    expect(
      screen.getByText('La historia se ha cerrado sola. Vuelve a escribir tu PIN para seguir.'),
    ).toBeInTheDocument();
    // Y no se ha vuelto a pedir nada: cerrarse no es abrir otra vez.
    expect(abrirPestanaDeHistoria).toHaveBeenCalledTimes(1);
  });

  it('cerrar con el botón devuelve a la pantalla de bloqueo sin recargar', async () => {
    const usuario = userEvent.setup();
    abrirPestanaDeHistoria.mockResolvedValue(abierta(15));
    render(<PanelHistoria pacienteId="11111111-1111-4111-8111-111111111111" />);

    await screen.findByText('Ansiedad ante exámenes');
    await usuario.click(screen.getByRole('button', { name: 'Cerrar la historia' }));

    expect(await screen.findByText('Esta historia está cerrada')).toBeInTheDocument();
    expect(cerrarHistoriaDelPaciente).toHaveBeenCalledTimes(1);
  });

  it('cambiar de sub-pestaña vuelve a pasar por la acción que registra el acceso', async () => {
    // El registro es lo que hace lícita la lectura (ADR-037): cada entrada a una pestaña
    // pasa por la acción, aunque la ventana ya estuviera abierta.
    const usuario = userEvent.setup();
    abrirPestanaDeHistoria.mockResolvedValue(abierta(15));
    render(<PanelHistoria pacienteId="11111111-1111-4111-8111-111111111111" />);

    await screen.findByText('Ansiedad ante exámenes');
    await usuario.click(screen.getByRole('tab', { name: 'Notas clínicas' }));

    await waitFor(() =>
      expect(abrirPestanaDeHistoria).toHaveBeenLastCalledWith(
        '11111111-1111-4111-8111-111111111111',
        'notas_clinicas',
      ),
    );
    expect(await screen.findByText('Esta sección todavía no está')).toBeInTheDocument();
  });

  it('las sub-pestañas son cuatro: los documentos viven fuera del candado (ADR-048)', async () => {
    abrirPestanaDeHistoria.mockResolvedValue(abierta(15));
    render(<PanelHistoria pacienteId="11111111-1111-4111-8111-111111111111" />);

    await screen.findByText('Ansiedad ante exámenes');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Historial clínico',
      'Notas clínicas',
      'Evaluaciones',
      'Informes',
    ]);
  });

  it('el aviso de caducidad llega tarde y sin robar el foco', async () => {
    abrirPestanaDeHistoria.mockResolvedValue(abierta(2));
    render(<PanelHistoria pacienteId="11111111-1111-4111-8111-111111111111" />);

    // Primero el contenido: el esqueleto de carga también es un `role="status"`.
    await screen.findByText('Ansiedad ante exámenes');

    const aviso = screen.getByRole('status');
    expect(aviso).toHaveTextContent('Se va a cerrar en breve');
    expect(aviso).toHaveAttribute('aria-live', 'polite');
    expect(document.body).toHaveFocus();
  });
});
