import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BloqueAlta } from '@/lib/citas/alta';

const m = vi.hoisted(() => ({
  recalcularAlta: vi.fn(),
  previsualizarAltaSerie: vi.fn(),
  guardarAlta: vi.fn(),
  buscarPacientes: vi.fn(),
}));
vi.mock('./acciones', () => m);

import { FormularioAlta } from './formulario-alta';
import type { VistaAlta } from './estado-alta';
import { construirCalendarioAlta } from './vista-alta';

const PACIENTE = { id: '11111111-1111-4111-8111-111111111111', nombre: 'Ana Pérez' };
const PROFESIONAL = '22222222-2222-4222-8222-222222222222';
const CENTRO = '33333333-3333-4333-8333-333333333333';
const TIPO_A = '44444444-4444-4444-8444-444444444444';
const TIPO_B = '55555555-5555-4555-8555-555555555555';
const TIPOS = [
  { id: TIPO_A, nombre: 'Individual', duracionMinutos: 50 },
  { id: TIPO_B, nombre: 'Larga', duracionMinutos: 90 },
];

function bloque(fecha: string, horaLocal: string, estado: BloqueAlta['estado']): BloqueAlta {
  const [h, mi] = horaLocal.split(':').map(Number);
  const inicio = new Date(`${fecha}T${String(h - 2).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00Z`);
  return { fecha, horaLocal, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(), estado };
}

function vistaCon(bloques: BloqueAlta[]): VistaAlta {
  return {
    calendario: construirCalendarioAlta({
      fechaFoco: '2026-10-06',
      zona: 'Europe/Madrid',
      hoy: '2026-10-04',
      sugerencias: { modo: 'enFrio', sugerencias: [] },
      bloques,
    }),
    modo: 'enFrio',
    tarjetas: [],
    errorSugerencias: false,
  };
}

const VISTA = vistaCon([bloque('2026-10-06', '17:00', 'libre'), bloque('2026-10-06', '18:00', 'libre')]);

function pinta(extra: Partial<Parameters<typeof FormularioAlta>[0]> = {}) {
  const props = {
    rol: 'profesional_sanitario' as const,
    centros: [{ id: CENTRO, nombre: 'Centro Sur' }],
    profesionales: [{ id: PROFESIONAL, nombre: 'Dra. Ruiz' }],
    tipos: TIPOS,
    inicial: { paciente: PACIENTE, centroId: CENTRO, profesionalId: PROFESIONAL, clave: null },
    vista: VISTA,
    alTerminar: vi.fn(),
    alCancelar: vi.fn(),
    ...extra,
  };
  return { ...render(<FormularioAlta {...props} />), props };
}

async function elegirTipoYHueco(tipo = TIPO_A) {
  fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: tipo } });
  fireEvent.click(await screen.findByRole('button', { name: /17:00, libre/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  m.recalcularAlta.mockResolvedValue({ ok: true, vista: VISTA, duracionMinutos: 50 });
  m.buscarPacientes.mockResolvedValue({ ok: true, pacientes: [] });
});

describe('FormularioAlta · campos por rol', () => {
  it('el tipo de terapia es obligatorio y está para los tres roles', () => {
    for (const rol of ['administrador', 'profesional_sanitario', 'tecnico_administrativo'] as const) {
      const { unmount } = pinta({ rol });
      expect(screen.getByLabelText('Tipo de terapia')).toBeTruthy();
      unmount();
    }
  });

  it('el profesional solo se elige siendo administrador o técnico; la nota operativa, no siendo técnico', () => {
    const profesional = pinta({ rol: 'profesional_sanitario' });
    expect(screen.queryByLabelText('Profesional')).toBeNull();
    expect(screen.getByLabelText(/Nota operativa/)).toBeTruthy();
    profesional.unmount();

    const tecnico = pinta({ rol: 'tecnico_administrativo' });
    expect(screen.getByLabelText('Profesional')).toBeTruthy();
    expect(screen.queryByLabelText(/Nota operativa/)).toBeNull();
    tecnico.unmount();

    pinta({ rol: 'administrador' });
    expect(screen.getByLabelText('Profesional')).toBeTruthy();
    expect(screen.getByLabelText(/Nota operativa/)).toBeTruthy();
  });

  it('sin modalidad, episodio, diagnóstico ni motivo de consulta', () => {
    const { container } = pinta();
    const texto = container.textContent ?? '';
    expect(texto).not.toMatch(/modalidad|episodio|diagn[oó]stico|motivo de consulta/i);
    expect(screen.queryByLabelText(/modalidad/i)).toBeNull();
  });

  it('con el catálogo vacío lo dice y no se puede guardar', () => {
    pinta({ tipos: [] });

    expect(screen.getByText('No hay tipos de terapia activos. Los da de alta el administrador.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('la duración sale del tipo elegido', () => {
    pinta();
    expect(screen.getByText('Duración: elige un tipo')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_B } });

    expect(screen.getByText('Duración: 90 min')).toBeTruthy();
  });
});

describe('FormularioAlta · guardar', () => {
  it('una cita suelta se guarda con lo elegido, sin modalidad ni nombre de tipo, y avisa de que ha terminado', async () => {
    m.guardarAlta.mockResolvedValue({ ok: true, anuncio: 'Cita guardada.', fecha: '2026-10-06' });
    const { props } = pinta();

    await elegirTipoYHueco();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(props.alTerminar).toHaveBeenCalledWith({ anuncio: 'Cita guardada.', fecha: '2026-10-06' }));
    expect(m.guardarAlta).toHaveBeenCalledWith({
      pacienteId: PACIENTE.id,
      profesionalId: PROFESIONAL,
      centroId: CENTRO,
      tipoTerapiaId: TIPO_A,
      fecha: '2026-10-06',
      horaLocal: '17:00',
      periodicidad: 'suelta',
      sesionesTotales: null,
      sala: null,
      notaOperativa: null,
      excluir: [],
      aceptarAlternativas: [],
      firma: null,
    });
  });

  it('sin hueco elegido no llama al servidor y pide elegirlo', async () => {
    pinta();

    fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_A } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Elige un hueco libre del calendario.')).toBeTruthy();
    expect(m.guardarAlta).not.toHaveBeenCalled();
  });

  it('sin tipo elegido no llama al servidor y lo pide', async () => {
    pinta();

    fireEvent.click(await screen.findByRole('button', { name: /17:00, libre/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Elige un tipo de terapia.')).toBeTruthy();
    expect(m.guardarAlta).not.toHaveBeenCalled();
  });

  it('un hueco que acaba de ocuparse se dice en una región de estado, se desmarca y se conserva el formulario', async () => {
    const sinElHueco = vistaCon([bloque('2026-10-06', '17:00', 'ocupado'), bloque('2026-10-06', '18:00', 'libre')]);
    m.guardarAlta.mockResolvedValue({
      ok: false,
      motivo: 'hueco_ocupado',
      mensaje: 'Ese hueco acaba de ocuparse. Elige otro de los que quedan.',
      vista: sinElHueco,
    });
    // Al excluir el hueco, el servidor ya no lo devuelve libre.
    m.recalcularAlta
      .mockResolvedValueOnce({ ok: true, vista: VISTA, duracionMinutos: 50 })
      .mockResolvedValue({ ok: true, vista: sinElHueco, duracionMinutos: 50 });
    const { props } = pinta();

    await elegirTipoYHueco();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Ese hueco acaba de ocuparse. Elige otro de los que quedan.'),
    );
    expect(props.alTerminar).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /17:00, libre/ })).toBeNull();
    expect((screen.getByLabelText('Tipo de terapia') as HTMLSelectElement).value).toBe(TIPO_A);
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
  });
});

describe('FormularioAlta · duración y hueco', () => {
  it('si con la nueva duración el hueco elegido ya no cabe, se desmarca y se dice', async () => {
    const sinElHueco = vistaCon([bloque('2026-10-06', '17:00', 'ocupado'), bloque('2026-10-06', '18:00', 'libre')]);
    m.recalcularAlta
      .mockResolvedValueOnce({ ok: true, vista: VISTA, duracionMinutos: 50 })
      .mockResolvedValue({ ok: true, vista: sinElHueco, duracionMinutos: 90 });
    pinta();

    await elegirTipoYHueco(TIPO_A);
    expect(screen.getByRole('button', { name: /17:00, libre.*elegida/ })).toBeTruthy();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_B } });
    });

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Con esta duración el hueco elegido ya no cabe.'),
    );
    expect(screen.queryByRole('button', { name: /elegida/ })).toBeNull();
  });
});

describe('FormularioAlta · serie', () => {
  it('con periodicidad semanal pide la previsualización y guarda con su firma', async () => {
    const FIRMA = 'a'.repeat(64);
    m.previsualizarAltaSerie.mockResolvedValue({
      ok: true,
      firma: FIRMA,
      sesiones: [
        { fecha: '2026-10-06', fechaLarga: 'Martes, 6 de octubre de 2026', hora: '17:00', estado: 'normal', alternativa: null, horaResultante: null },
        { fecha: '2026-10-13', fechaLarga: 'Martes, 13 de octubre de 2026', hora: '17:00', estado: 'normal', alternativa: null, horaResultante: null },
      ],
    });
    m.guardarAlta.mockResolvedValue({ ok: true, anuncio: 'Serie guardada.', fecha: '2026-10-06' });
    const { props } = pinta();

    await elegirTipoYHueco();
    fireEvent.change(screen.getByLabelText('Periodicidad'), { target: { value: 'semanal' } });
    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '2' } });

    expect(await screen.findByText('Así quedaría la serie')).toBeTruthy();
    expect(m.previsualizarAltaSerie).toHaveBeenLastCalledWith(
      expect.objectContaining({ tipoTerapiaId: TIPO_A, periodicidad: 'semanal', sesionesTotales: 2, fecha: '2026-10-06', horaLocal: '17:00' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(props.alTerminar).toHaveBeenCalled());
    expect(m.guardarAlta).toHaveBeenCalledWith(
      expect.objectContaining({ periodicidad: 'semanal', sesionesTotales: 2, firma: FIRMA, excluir: [], aceptarAlternativas: [] }),
    );
  });

  it('si la serie cambió mientras se revisaba, enseña la nueva y no guarda', async () => {
    const NUEVA = 'b'.repeat(64);
    m.previsualizarAltaSerie.mockResolvedValue({
      ok: true,
      firma: 'a'.repeat(64),
      sesiones: [
        { fecha: '2026-10-06', fechaLarga: 'Martes, 6 de octubre de 2026', hora: '17:00', estado: 'normal', alternativa: null, horaResultante: null },
      ],
    });
    m.guardarAlta.mockResolvedValue({
      ok: false,
      motivo: 'previsualizacion_caducada',
      mensaje: 'La serie ha cambiado mientras la revisabas. Revisa de nuevo las fechas.',
      firma: NUEVA,
      sesiones: [
        { fecha: '2026-10-06', fechaLarga: 'Martes, 6 de octubre de 2026', hora: null, estado: 'ocupada', alternativa: null, horaResultante: null },
      ],
    });
    const { props } = pinta();

    await elegirTipoYHueco();
    fireEvent.change(screen.getByLabelText('Periodicidad'), { target: { value: 'semanal' } });
    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '2' } });
    await screen.findByText('Así quedaría la serie');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('La serie ha cambiado mientras la revisabas.'));
    expect(props.alTerminar).not.toHaveBeenCalled();
    expect(screen.getByText('Hueco ocupado')).toBeTruthy();
  });
});
