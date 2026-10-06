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

function vistaCon(bloques: BloqueAlta[], huecosRaros: Record<string, number> = {}): VistaAlta {
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
    huecosRaros,
  };
}

const VISTA = vistaCon([bloque('2026-10-06', '17:00', 'libre'), bloque('2026-10-06', '18:00', 'libre')]);

function pinta(extra: Partial<Parameters<typeof FormularioAlta>[0]> = {}) {
  const props = {
    rol: 'profesional_sanitario' as const,
    centros: [{ id: CENTRO, nombre: 'Centro Sur' }],
    profesionales: [{ id: PROFESIONAL, nombre: 'Dra. Ruiz', centroId: CENTRO }],
    tipos: TIPOS,
    inicial: { paciente: PACIENTE, centroId: CENTRO, profesionalId: PROFESIONAL, clave: null },
    vista: VISTA,
    alTerminar: vi.fn(),
    alCancelar: vi.fn(),
    ...extra,
  };
  return { ...render(<FormularioAlta {...props} />), props };
}

// Con la region del estado vacio de las sugerencias (H30) hay mas de una region de estado: se leen todas.
const avisos = () => screen.getAllByRole('status').map((e) => e.textContent).join(' | ');

async function elegirTipoYHueco(tipo = TIPO_A) {
  fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: tipo } });
  // Sin CSS, la rejilla (md+) y la lista (móvil) están las dos en el DOM: vale la primera.
  fireEvent.click((await screen.findAllByRole('button', { name: /17:00, libre/ }))[0]);
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
    expect(screen.getByRole('button', { name: 'Guardar' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('la duración sale del tipo elegido', () => {
    pinta();
    expect(screen.getByText('Duración: elige un tipo')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_B } });

    expect(screen.getByText('Duración: 90 min')).toBeTruthy();
  });
});

describe('FormularioAlta · hueco de entrada', () => {
  it('un hueco libre que llega de la URL entra elegido', () => {
    pinta({ inicial: { paciente: PACIENTE, centroId: CENTRO, profesionalId: PROFESIONAL, clave: '2026-10-06T17:00' } });

    expect(screen.getAllByRole('button', { name: /17:00, libre.*elegida/ })[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('uno ocupado o inexistente se ignora', () => {
    pinta({ inicial: { paciente: PACIENTE, centroId: CENTRO, profesionalId: PROFESIONAL, clave: '2026-10-06T03:00' } });

    expect(screen.queryByRole('button', { name: /elegida/ })).toBeNull();
  });
});

describe('FormularioAlta · guardar', () => {
  it('una cita suelta se guarda con lo elegido, sin modalidad ni nombre de tipo, y avisa de que ha terminado', async () => {
    m.guardarAlta.mockResolvedValue({ ok: true, anuncio: 'Cita guardada.', fecha: '2026-10-06' });
    const { props } = pinta();

    await elegirTipoYHueco();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(props.alTerminar).toHaveBeenCalledWith({ anuncio: 'Cita guardada.', fecha: '2026-10-06', centroId: CENTRO }));
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

    fireEvent.click((await screen.findAllByRole('button', { name: /17:00, libre/ }))[0]);
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
      expect(avisos()).toContain('Ese hueco acaba de ocuparse. Elige otro de los que quedan.'),
    );
    expect(props.alTerminar).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /17:00, libre/ })).toBeNull();
    expect((screen.getByLabelText('Tipo de terapia') as HTMLSelectElement).value).toBe(TIPO_A);
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
  });
});

describe('FormularioAlta · hueco elegido fuera de la semana visible (H8)', () => {
  const SEMANA_2 = {
    ...VISTA,
    calendario: construirCalendarioAlta({
      fechaFoco: '2026-10-13',
      zona: 'Europe/Madrid',
      hoy: '2026-10-04',
      sugerencias: { modo: 'enFrio', sugerencias: [] },
      bloques: [bloque('2026-10-13', '10:00', 'libre')],
    }),
  };
  const SIN_EL_HUECO = vistaCon([bloque('2026-10-06', '17:00', 'ocupado'), bloque('2026-10-06', '18:00', 'libre')]);

  it('al cambiar la duración con el elegido en otra semana, se comprueba también ese hueco y no se dice «acaba de ocuparse» al guardar', async () => {
    m.recalcularAlta.mockImplementation(async (entrada: { fechaFoco: string | null; tipoTerapiaId: string | null }) => {
      if (entrada.fechaFoco === '2026-10-12') return { ok: true, vista: SEMANA_2, duracionMinutos: 50 };
      // La semana del elegido con la duración larga: ya no cabe.
      if (entrada.fechaFoco === '2026-10-05' && entrada.tipoTerapiaId === TIPO_B) return { ok: true, vista: SIN_EL_HUECO, duracionMinutos: 90 };
      return { ok: true, vista: VISTA, duracionMinutos: 50 };
    });
    pinta();
    await elegirTipoYHueco(TIPO_A);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    });
    await screen.findAllByRole('button', { name: /10:00, libre/ });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_B } });
    });

    await waitFor(() =>
      expect(avisos()).toContain('Con esta duración el hueco elegido ya no cabe.'),
    );
    expect(screen.queryByRole('button', { name: /elegida/ })).toBeNull();
    expect(m.recalcularAlta).toHaveBeenLastCalledWith(expect.objectContaining({ fechaFoco: '2026-10-05' }));
  });

  it('si el guardado dice que el hueco se ocupó mientras se recalcula la duración, queda el mensaje del conflicto y no el de «no cabe»', async () => {
    let resolverRecalculo: (valor: unknown) => void = () => {};
    m.recalcularAlta
      .mockResolvedValueOnce({ ok: true, vista: VISTA, duracionMinutos: 50 })
      .mockImplementationOnce(() => new Promise((resolver) => (resolverRecalculo = resolver)))
      .mockResolvedValue({ ok: true, vista: SIN_EL_HUECO, duracionMinutos: 90 });
    m.guardarAlta.mockResolvedValue({
      ok: false,
      motivo: 'hueco_ocupado',
      mensaje: 'Ese hueco acaba de ocuparse. Elige otro de los que quedan.',
      vista: SIN_EL_HUECO,
    });
    pinta();
    await elegirTipoYHueco(TIPO_A);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_B } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    });
    await act(async () => {
      resolverRecalculo({ ok: true, vista: SIN_EL_HUECO, duracionMinutos: 90 });
    });

    await waitFor(() => expect(avisos()).toContain('Ese hueco acaba de ocuparse'));
    expect(avisos()).not.toContain('ya no cabe');
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
    expect(screen.getAllByRole('button', { name: /17:00, libre.*elegida/ })[0]).toBeTruthy();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_B } });
    });

    await waitFor(() =>
      expect(avisos()).toContain('Con esta duración el hueco elegido ya no cabe.'),
    );
    expect(screen.queryByRole('button', { name: /elegida/ })).toBeNull();
  });
});

// man-12 (ronda 3, FALLA del verificador): a 360 px los campos de texto medían 40 px; el minimo es 44 (ADR-044).
describe('FormularioAlta · tamano de los campos (man-12)', () => {
  it('Numero de sesiones y Sala, y todo campo del formulario, piden 44 px o mas', () => {
    pinta();
    fireEvent.change(screen.getByLabelText('Periodicidad'), { target: { value: 'semanal' } });

    const campos = Array.from(document.querySelectorAll('form input:not([type=hidden]):not([type=checkbox]), form select'));
    expect(campos.length).toBeGreaterThanOrEqual(4);
    for (const campo of campos) {
      expect(campo.className.split(' ').some((c) => c === 'h-11' || c === 'min-h-11'), campo.id).toBe(true);
    }
  });
});

// Observacion del verificador (ronda 3): un error de validacion se va en cuanto el campo ya es valido, sin esperar a otro envio.
describe('FormularioAlta · los errores se limpian al corregir', () => {
  const error = (sufijo: string) => document.querySelector(`[id$="-${sufijo}-error"]`);
  const avisoHueco = () => screen.queryAllByRole('alert').some((a) => a.textContent === 'Elige un hueco libre del calendario.');
  const enviarVacio = async () => {
    fireEvent.submit(document.querySelector('form') as HTMLElement);
    await waitFor(() => expect(error('tipo')).not.toBeNull());
  };

  it('el error del tipo desaparece al elegir uno', async () => {
    pinta();
    await enviarVacio();

    fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_A } });

    await waitFor(() => expect(error('tipo')).toBeNull());
  });

  it('el aviso de hueco desaparece al elegir un hueco', async () => {
    pinta();
    await enviarVacio();
    expect(avisoHueco()).toBe(true);

    fireEvent.click((await screen.findAllByRole('button', { name: /17:00, libre/ }))[0]);

    await waitFor(() => expect(avisoHueco()).toBe(false));
  });

  it('el error de las sesiones desaparece al poner un numero valido', async () => {
    pinta();
    fireEvent.change(screen.getByLabelText('Periodicidad'), { target: { value: 'semanal' } });
    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '1' } });
    fireEvent.submit(document.querySelector('form') as HTMLElement);
    await waitFor(() => expect(error('sesiones')).not.toBeNull());

    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '5' } });

    await waitFor(() => expect(error('sesiones')).toBeNull());
  });
});

describe('FormularioAlta · sugerencias en vuelo', () => {
  it('mientras se recalcula no dice que no hay huecos, y cuando llega el resultado vacio si', async () => {
    let llega: (valor: unknown) => void = () => {};
    m.recalcularAlta.mockReturnValue(new Promise((resolver) => (llega = resolver)));
    pinta();
    expect(screen.getByText('Sin huecos libres en las próximas cuatro semanas.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_A } });

    await waitFor(() => expect(screen.getByText('Buscando huecos libres…')).toBeTruthy());
    expect(screen.queryByText('Sin huecos libres en las próximas cuatro semanas.')).toBeNull();

    llega({ ok: true, vista: VISTA, duracionMinutos: 50 });

    await waitFor(() => expect(screen.getByText('Sin huecos libres en las próximas cuatro semanas.')).toBeTruthy());
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

  // H3 (revisión del corte B): la firma enseñada era de otro profesional; mientras llega la nueva
  // previsualización no se puede guardar con la vieja.
  it('al cambiar de profesional anula la firma y no deja guardar hasta que llega la previsualización nueva', async () => {
    const OTRO = '66666666-6666-4666-8666-666666666666';
    const FIRMA_A = 'a'.repeat(64);
    const FIRMA_B = 'b'.repeat(64);
    const sesiones = [
      { fecha: '2026-10-06', fechaLarga: 'Martes, 6 de octubre de 2026', hora: '17:00', estado: 'normal' as const, alternativa: null, horaResultante: null },
      { fecha: '2026-10-13', fechaLarga: 'Martes, 13 de octubre de 2026', hora: '17:00', estado: 'normal' as const, alternativa: null, horaResultante: null },
    ];
    let resolverNueva: (valor: unknown) => void = () => {};
    m.previsualizarAltaSerie
      .mockImplementation(({ profesionalId }: { profesionalId: string }) =>
        profesionalId === OTRO
          ? new Promise((resolver) => (resolverNueva = resolver))
          : Promise.resolve({ ok: true, firma: FIRMA_A, sesiones }),
      );
    m.guardarAlta.mockResolvedValue({ ok: true, anuncio: 'Serie guardada.', fecha: '2026-10-06' });
    pinta({
      rol: 'administrador',
      profesionales: [
        { id: PROFESIONAL, nombre: 'Dra. Ruiz', centroId: CENTRO },
        { id: OTRO, nombre: 'Dr. Soto', centroId: CENTRO },
      ],
    });

    await elegirTipoYHueco();
    fireEvent.change(screen.getByLabelText('Periodicidad'), { target: { value: 'semanal' } });
    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '2' } });
    await screen.findByText('Así quedaría la serie');

    fireEvent.change(screen.getByLabelText('Profesional'), { target: { value: OTRO } });
    await waitFor(() => expect(m.previsualizarAltaSerie).toHaveBeenLastCalledWith(expect.objectContaining({ profesionalId: OTRO })));

    const guardar = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
    expect(guardar.getAttribute('aria-disabled')).toBe('true');
    fireEvent.submit(guardar.closest('form') as HTMLFormElement);
    await act(async () => {});
    expect(m.guardarAlta).not.toHaveBeenCalled();

    await act(async () => {
      resolverNueva({ ok: true, firma: FIRMA_B, sesiones });
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar' }).getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(m.guardarAlta).toHaveBeenCalledTimes(1));
    expect(m.guardarAlta).toHaveBeenCalledWith(expect.objectContaining({ profesionalId: OTRO, firma: FIRMA_B }));
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

    await waitFor(() => expect(avisos()).toContain('La serie ha cambiado mientras la revisabas.'));
    expect(props.alTerminar).not.toHaveBeenCalled();
    expect(screen.getByText('Hueco ocupado')).toBeTruthy();
  });
});

// H9 (ronda 3): al elegir paciente con el buscador, su profesional asignado pasa a ser el de por defecto.
describe('FormularioAlta · profesional por defecto al elegir paciente (H9)', () => {
  const ASIGNADO = '99999999-9999-4999-8999-999999999999';
  const profesionales = [
    { id: PROFESIONAL, nombre: 'Ana Ruiz', centroId: CENTRO },
    { id: ASIGNADO, nombre: 'Luis Soto', centroId: CENTRO },
  ];

  async function buscarYElegir() {
    m.buscarPacientes.mockResolvedValue({ ok: true, pacientes: [{ id: 'p-2', nombre: 'Bea Gil', profesionalId: ASIGNADO }] });
    fireEvent.change(screen.getByLabelText('Buscar paciente por nombre'), { target: { value: 'be' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Bea Gil' }));
  }

  it('entra el asignado y las sugerencias se recalculan con él', async () => {
    pinta({ rol: 'tecnico_administrativo', profesionales, inicial: { paciente: null, centroId: CENTRO, profesionalId: PROFESIONAL, clave: null } });

    await buscarYElegir();

    expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe(ASIGNADO);
    await waitFor(() =>
      expect(m.recalcularAlta).toHaveBeenLastCalledWith(expect.objectContaining({ pacienteId: 'p-2', profesionalId: ASIGNADO })),
    );
  });

  it('si el usuario ya eligió profesional a mano, no se lo cambia', async () => {
    pinta({ rol: 'tecnico_administrativo', profesionales, inicial: { paciente: null, centroId: CENTRO, profesionalId: PROFESIONAL, clave: null } });
    fireEvent.change(screen.getByLabelText('Profesional'), { target: { value: PROFESIONAL } });

    await buscarYElegir();

    expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe(PROFESIONAL);
  });

  it('si el asignado no trabaja en el centro elegido, se queda el que había', async () => {
    pinta({
      rol: 'tecnico_administrativo',
      profesionales: [{ id: PROFESIONAL, nombre: 'Ana Ruiz', centroId: CENTRO }],
      inicial: { paciente: null, centroId: CENTRO, profesionalId: PROFESIONAL, clave: null },
    });

    await buscarYElegir();

    expect((screen.getByLabelText('Profesional') as HTMLSelectElement).value).toBe(PROFESIONAL);
  });
});

// H22 y H24 (ronda 4): el asignado del paciente por la puerta del centro, y la guarda de «trabaja en este centro».
describe('FormularioAlta · el asignado y el centro (H22, H24)', () => {
  const NORTE = '88888888-8888-4888-8888-888888888888';
  const ANA_NORTE = '77777777-7777-4777-8777-777777777777';
  const LUIS_NORTE = '99999999-9999-4999-8999-999999999999';
  const centros = [
    { id: CENTRO, nombre: 'Centro Sur' },
    { id: NORTE, nombre: 'Centro Norte' },
  ];
  // Ana Abad es la primera de Norte; Luis Soto, el asignado de Bea.
  const profesionales = [
    { id: ANA_NORTE, nombre: 'Ana Abad', centroId: NORTE },
    { id: LUIS_NORTE, nombre: 'Luis Soto', centroId: NORTE },
    { id: PROFESIONAL, nombre: 'Dra. Ruiz', centroId: CENTRO },
  ];
  const BEA = { id: 'p-2', nombre: 'Bea Gil', profesionalId: LUIS_NORTE };
  const sur = { paciente: null, centroId: CENTRO, profesionalId: PROFESIONAL, clave: null };

  async function elegirBea() {
    m.buscarPacientes.mockResolvedValue({ ok: true, pacientes: [BEA] });
    fireEvent.change(screen.getByLabelText('Buscar paciente por nombre'), { target: { value: 'be' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Bea Gil' }));
  }

  const profesionalElegido = () => (screen.getByLabelText('Profesional') as HTMLSelectElement).value;

  it('H22: elegido el paciente en un centro donde no trabaja su asignado, al cambiar al centro del asignado entra el asignado y no el primero', async () => {
    pinta({ rol: 'tecnico_administrativo', centros, profesionales, inicial: sur });
    await elegirBea();
    expect(profesionalElegido()).toBe(PROFESIONAL);

    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: NORTE } });

    expect(profesionalElegido()).toBe(LUIS_NORTE);
    await waitFor(() =>
      expect(m.recalcularAlta).toHaveBeenLastCalledWith(
        expect.objectContaining({ pacienteId: 'p-2', profesionalId: LUIS_NORTE, centroId: NORTE }),
      ),
    );
  });

  it('H22/H28: si el profesional se eligió a mano, cambiar de centro no lo sustituye por el asignado; si ya no trabaja allí, entra el asignado y no el primero', async () => {
    pinta({ rol: 'tecnico_administrativo', centros, profesionales, inicial: sur });
    await elegirBea();
    fireEvent.change(screen.getByLabelText('Profesional'), { target: { value: PROFESIONAL } });

    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: NORTE } });

    expect(profesionalElegido()).toBe(LUIS_NORTE);
  });

  it('H22: sin paciente elegido, cambiar de centro sigue entrando el primero del centro nuevo', () => {
    pinta({ rol: 'tecnico_administrativo', centros, profesionales, inicial: sur });

    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: NORTE } });

    expect(profesionalElegido()).toBe(ANA_NORTE);
  });

  it('H22: con ?paciente= (paciente de entrada con su asignado), cambiar de centro propone al asignado', () => {
    pinta({ rol: 'tecnico_administrativo', centros, profesionales, inicial: { ...sur, paciente: BEA } });

    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: NORTE } });

    expect(profesionalElegido()).toBe(LUIS_NORTE);
  });

  it('H24: el asignado de otro centro no entra al elegir paciente: el profesional sigue siendo el del centro actual', async () => {
    pinta({ rol: 'tecnico_administrativo', centros, profesionales, inicial: sur });

    await elegirBea();

    await waitFor(() =>
      expect(m.recalcularAlta).toHaveBeenLastCalledWith(expect.objectContaining({ pacienteId: 'p-2', profesionalId: PROFESIONAL })),
    );
    expect(m.recalcularAlta).not.toHaveBeenCalledWith(expect.objectContaining({ profesionalId: LUIS_NORTE }));
  });
});

// H19 (ronda 3) y el salto a la semana de hoy: la semana que cuenta es la pedida, no la pintada.
describe('FormularioAlta · semana pedida y semana pintada (H19)', () => {
  const SEMANA_13 = {
    ...VISTA,
    calendario: construirCalendarioAlta({
      fechaFoco: '2026-10-13',
      zona: 'Europe/Madrid',
      hoy: '2026-10-04',
      sugerencias: { modo: 'enFrio', sugerencias: [] },
      bloques: [bloque('2026-10-13', '10:00', 'libre')],
    }),
  };

  it('con la semana siguiente todavía en vuelo, cambiar de tipo vuelve a pedir la semana del elegido', async () => {
    m.recalcularAlta.mockImplementation(
      (entrada: { fechaFoco: string | null }) =>
        entrada.fechaFoco === '2026-10-12'
          ? new Promise(() => {})
          : Promise.resolve({ ok: true, vista: VISTA, duracionMinutos: 50 }),
    );
    pinta();
    await elegirTipoYHueco(TIPO_A);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_B } });
    });

    await waitFor(() => expect(m.recalcularAlta).toHaveBeenLastCalledWith(expect.objectContaining({ fechaFoco: '2026-10-05', tipoTerapiaId: TIPO_B })));
  });

  it('si la página se abrió en otra semana (?inicio=), elegir el tipo no salta a la semana de hoy', async () => {
    pinta({ vista: SEMANA_13 });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_A } });
    });

    await waitFor(() => expect(m.recalcularAlta).toHaveBeenCalled());
    expect(m.recalcularAlta).toHaveBeenLastCalledWith(expect.objectContaining({ fechaFoco: '2026-10-12' }));
  });
});

// H15 (ronda 3): esperar a la serie no puede esconder los errores ni dejar sin salida un fallo.
describe('FormularioAlta · la espera de la serie (H15)', () => {
  const SESIONES = [
    { fecha: '2026-10-06', fechaLarga: 'Martes, 6 de octubre de 2026', hora: '17:00', estado: 'normal' as const, alternativa: null, horaResultante: null },
    { fecha: '2026-10-13', fechaLarga: 'Martes, 13 de octubre de 2026', hora: '17:00', estado: 'normal' as const, alternativa: null, horaResultante: null },
  ];

  it('con semanal y 1 sesión, Guardar está activo y enseña el error del número de sesiones', async () => {
    pinta();
    await elegirTipoYHueco();
    fireEvent.change(screen.getByLabelText('Periodicidad'), { target: { value: 'semanal' } });
    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '1' } });

    const guardar = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
    expect(guardar.getAttribute('aria-disabled')).not.toBe('true');
    await act(async () => {
      fireEvent.click(guardar);
    });

    expect(await screen.findByText('Una serie tiene entre 2 y 52 sesiones.')).toBeTruthy();
    expect(m.guardarAlta).not.toHaveBeenCalled();
  });

  it('si la previsualización falla por transporte, Guardar sigue activo y volver a pulsarlo la reintenta', async () => {
    m.previsualizarAltaSerie.mockRejectedValueOnce(new Error('red')).mockResolvedValue({ ok: true, firma: 'a'.repeat(64), sesiones: SESIONES });
    pinta();
    await elegirTipoYHueco();
    // Las 8 sesiones por defecto: una sola petición, la que falla.
    fireEvent.change(screen.getByLabelText('Periodicidad'), { target: { value: 'semanal' } });

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se ha podido calcular la serie'));
    const guardar = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
    expect(guardar.getAttribute('aria-disabled')).not.toBe('true');

    await act(async () => {
      fireEvent.click(guardar);
    });

    expect(await screen.findByText('Así quedaría la serie')).toBeTruthy();
    expect(m.previsualizarAltaSerie).toHaveBeenCalledTimes(2);
    expect(m.guardarAlta).not.toHaveBeenCalled();
  });

  it('mientras la serie está en vuelo, Guardar sigue desactivado', async () => {
    m.previsualizarAltaSerie.mockImplementation(() => new Promise(() => {}));
    pinta();
    await elegirTipoYHueco();
    fireEvent.change(screen.getByLabelText('Periodicidad'), { target: { value: 'semanal' } });
    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '2' } });

    await waitFor(() => expect(m.previsualizarAltaSerie).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Guardar' }).getAttribute('aria-disabled')).toBe('true');
  });
});

// H31 (ronda 4): los errores de validacion se van cuando lo que los causaba se corrige, y solo entonces.
describe('FormularioAlta · limpiar errores al corregir (H31)', () => {
  const FIRMA = 'a'.repeat(64);
  const SESIONES = [
    { fecha: '2026-10-06', fechaLarga: 'Martes, 6 de octubre de 2026', hora: '17:00', estado: 'normal' as const, alternativa: null, horaResultante: null },
    { fecha: '2026-10-13', fechaLarga: 'Martes, 13 de octubre de 2026', hora: '17:00', estado: 'normal' as const, alternativa: null, horaResultante: null },
  ];

  it('elegir paciente borra «Elige un paciente.»', async () => {
    m.buscarPacientes.mockResolvedValue({ ok: true, pacientes: [PACIENTE] });
    pinta({ inicial: { paciente: null, centroId: CENTRO, profesionalId: PROFESIONAL, clave: null } });
    await elegirTipoYHueco();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Elige un paciente.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Buscar paciente por nombre'), { target: { value: 'an' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Ana Pérez' }));

    await waitFor(() => expect(screen.queryByText('Elige un paciente.')).toBeNull());
  });

  it('la previsualizacion de la serie borra «Falta la previsualización de la serie.»', async () => {
    m.previsualizarAltaSerie.mockResolvedValue({ ok: true, firma: FIRMA, sesiones: SESIONES });
    pinta();
    await elegirTipoYHueco();
    fireEvent.change(screen.getByLabelText('Periodicidad'), { target: { value: 'semanal' } });
    await screen.findByText('Así quedaría la serie');
    // Un cambio que invalida la serie y deja una sesion fuera de rango: Guardar valida y enseña los dos errores.
    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '1' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    });
    expect(await screen.findByText('Falta la previsualización de la serie.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '2' } });

    await waitFor(() => expect(screen.queryByText('Falta la previsualización de la serie.')).toBeNull());
  });

  it('un numero de sesiones aun fuera de rango no borra su error; uno valido, si', async () => {
    pinta();
    await elegirTipoYHueco();
    fireEvent.change(screen.getByLabelText('Periodicidad'), { target: { value: 'semanal' } });
    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '1' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    });
    expect(await screen.findByText('Una serie tiene entre 2 y 52 sesiones.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '0' } });
    expect(screen.queryByText('Una serie tiene entre 2 y 52 sesiones.')).not.toBeNull();

    fireEvent.change(screen.getByLabelText('Número de sesiones'), { target: { value: '3' } });
    await waitFor(() => expect(screen.queryByText('Una serie tiene entre 2 y 52 sesiones.')).toBeNull());
  });
});

// H27 (ronda 4): Guardar no se deshabilita con el foco dentro; si no, tras un rechazo el foco queda en body.
describe('FormularioAlta · el foco no se pierde al guardar (H27)', () => {
  const SALIDAS: Array<[string, () => void]> = [
    [
      'hueco_ocupado',
      () => m.guardarAlta.mockResolvedValue({ ok: false, motivo: 'hueco_ocupado', mensaje: 'Ese hueco acaba de ocuparse.', vista: null }),
    ],
    [
      'previsualizacion_caducada',
      () =>
        m.guardarAlta.mockResolvedValue({ ok: false, motivo: 'previsualizacion_caducada', mensaje: 'Caducó.', firma: 'a'.repeat(64), sesiones: [] }),
    ],
    ['fallo', () => m.guardarAlta.mockResolvedValue({ ok: false, motivo: 'fallo', mensaje: 'No se pudo guardar.' })],
    ['catch', () => m.guardarAlta.mockRejectedValue(new Error('red'))],
  ];

  it.each(SALIDAS)('tras %s, Guardar sigue enfocado y activable', async (_nombre, preparar) => {
    preparar();
    pinta();
    await elegirTipoYHueco();
    const guardar = screen.getByRole('button', { name: /Guardar/ }) as HTMLButtonElement;
    guardar.focus();

    await act(async () => {
      fireEvent.click(guardar);
    });

    await waitFor(() => expect(m.guardarAlta).toHaveBeenCalledTimes(1));
    expect(guardar.disabled).toBe(false);
    expect(guardar.getAttribute('aria-disabled')).not.toBe('true');
    expect(document.activeElement).toBe(guardar);
  });

  it('mientras guarda no lleva disabled (aria-disabled) y un segundo envío no repite la acción', async () => {
    let resolver: (v: unknown) => void = () => {};
    m.guardarAlta.mockImplementation(() => new Promise((r) => (resolver = r)));
    pinta();
    await elegirTipoYHueco();
    const guardar = screen.getByRole('button', { name: /Guardar/ }) as HTMLButtonElement;
    guardar.focus();

    await act(async () => {
      fireEvent.click(guardar);
    });
    await waitFor(() => expect(guardar.getAttribute('aria-disabled')).toBe('true'));
    expect(guardar.disabled).toBe(false);

    await act(async () => {
      fireEvent.submit(guardar.closest('form') as HTMLFormElement);
    });
    expect(m.guardarAlta).toHaveBeenCalledTimes(1);

    await act(async () => resolver({ ok: false, motivo: 'fallo', mensaje: 'x' }));
  });
});

// T-043 · el aviso de hueco raro al pulsar Guardar.
describe('FormularioAlta · aviso de hueco raro', () => {
  const RARA = vistaCon(
    [bloque('2026-10-06', '17:00', 'libre'), bloque('2026-10-06', '18:00', 'libre'), bloque('2026-10-06', '19:00', 'libre')],
    { '2026-10-06T17:00': 30 },
  );
  const AVISO = 'Esta cita deja un hueco corto';

  function pintaRara() {
    m.recalcularAlta.mockResolvedValue({ ok: true, vista: RARA, duracionMinutos: 50 });
    return pinta({ vista: RARA });
  }

  it('al pulsar Guardar sobre un hueco raro no guarda: enseña el aviso con los minutos y le da el foco', async () => {
    pintaRara();
    await elegirTipoYHueco();
    expect(screen.queryByRole('region', { name: AVISO })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const aviso = await screen.findByRole('region', { name: AVISO });
    expect(aviso).toHaveAccessibleDescription(/30 minutos/);
    expect(m.guardarAlta).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(aviso));
  });

  it('un hueco que no es raro se guarda sin aviso', async () => {
    m.guardarAlta.mockResolvedValue({ ok: true, anuncio: 'Cita guardada.', fecha: '2026-10-06' });
    pintaRara();
    fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_A } });
    fireEvent.click((await screen.findAllByRole('button', { name: /18:00, libre/ }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(m.guardarAlta).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('region', { name: AVISO })).toBeNull();
  });

  it('«Agendar igualmente» guarda exactamente lo elegido, una vez', async () => {
    m.guardarAlta.mockResolvedValue({ ok: true, anuncio: 'Cita guardada.', fecha: '2026-10-06' });
    const { props } = pintaRara();
    await elegirTipoYHueco();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('region', { name: AVISO });

    fireEvent.click(screen.getByRole('button', { name: 'Agendar igualmente' }));

    await waitFor(() => expect(m.guardarAlta).toHaveBeenCalledTimes(1));
    expect(m.guardarAlta).toHaveBeenCalledWith(expect.objectContaining({ fecha: '2026-10-06', horaLocal: '17:00', tipoTerapiaId: TIPO_A }));
    await waitFor(() => expect(props.alTerminar).toHaveBeenCalled());
  });

  it('pulsar Guardar con el aviso ya visible no guarda y devuelve el foco al aviso', async () => {
    pintaRara();
    await elegirTipoYHueco();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    const aviso = await screen.findByRole('region', { name: AVISO });
    screen.getByRole('button', { name: 'Guardar' }).focus();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(document.activeElement).toBe(aviso));
    expect(m.guardarAlta).not.toHaveBeenCalled();
  });

  it('elegir una alternativa cambia el hueco, quita el aviso, deja el foco en «Hueco elegido» y no guarda', async () => {
    pintaRara();
    await elegirTipoYHueco();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('region', { name: AVISO });
    const lista = screen.getByRole('list', { name: 'Huecos que no lo dejan' });
    expect(lista.querySelectorAll('li').length).toBeGreaterThan(0);

    fireEvent.click(lista.querySelector('button') as HTMLElement);

    await waitFor(() => expect(screen.queryByRole('region', { name: AVISO })).toBeNull());
    const resumen = screen.getByText(/Hueco elegido/).closest('p') as HTMLElement;
    expect(resumen.textContent).toMatch(/18:00/);
    await waitFor(() => expect(document.activeElement).toBe(resumen));
    expect(m.guardarAlta).not.toHaveBeenCalled();
  });

  it('elegir otro hueco a mano quita el aviso, y volver al raro no lo resucita sin pulsar Guardar', async () => {
    pintaRara();
    await elegirTipoYHueco();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('region', { name: AVISO });

    fireEvent.click(screen.getAllByRole('button', { name: /19:00, libre/ })[0]);
    expect(screen.queryByRole('region', { name: AVISO })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /17:00, libre/ })[0]);
    expect(screen.queryByRole('region', { name: AVISO })).toBeNull();
  });

  it('un recálculo que quita la rareza del elegido retira el aviso', async () => {
    pintaRara();
    await elegirTipoYHueco();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('region', { name: AVISO });

    const sinRara = vistaCon([bloque('2026-10-06', '17:00', 'libre'), bloque('2026-10-06', '18:00', 'libre'), bloque('2026-10-06', '19:00', 'libre')]);
    m.recalcularAlta.mockResolvedValue({ ok: true, vista: sinRara, duracionMinutos: 90 });
    fireEvent.change(screen.getByLabelText('Tipo de terapia'), { target: { value: TIPO_B } });

    await waitFor(() => expect(screen.queryByRole('region', { name: AVISO })).toBeNull());
  });

  it('si al agendar igualmente el hueco acaba de ocuparse, el foco no se pierde en body', async () => {
    m.guardarAlta.mockResolvedValue({
      ok: false,
      motivo: 'hueco_ocupado',
      mensaje: 'Ese hueco acaba de ocuparse. Elige otro de los que quedan.',
      vista: vistaCon([bloque('2026-10-06', '17:00', 'ocupado'), bloque('2026-10-06', '18:00', 'libre')]),
    });
    pintaRara();
    await elegirTipoYHueco();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('region', { name: AVISO });
    screen.getByRole('button', { name: 'Agendar igualmente' }).focus();

    fireEvent.click(screen.getByRole('button', { name: 'Agendar igualmente' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: AVISO })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Guardar' })));
  });
});

