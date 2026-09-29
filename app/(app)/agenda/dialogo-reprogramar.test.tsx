import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResultadoAccion, ResultadoPrevisualizar } from './acciones';
import type { CitaVista, DiaVista } from './vista';

const reprogramar = vi.fn();
const previsualizarMovimiento = vi.fn();
vi.mock('./acciones', () => ({
  reprogramar: (...a: unknown[]) => reprogramar(...a),
  previsualizarMovimiento: (...a: unknown[]) => previsualizarMovimiento(...a),
}));

const { DialogoReprogramar } = await import('./dialogo-reprogramar');

const FIRMA = 'a'.repeat(64);
const CITA_ID = '22222222-2222-4222-8222-222222222222';

const cita = (extra: Partial<CitaVista> = {}): CitaVista => ({
  id: CITA_ID,
  tramo: 0,
  pacienteId: '33333333-3333-4333-8333-333333333333',
  diaIndice: 1,
  fechaLocal: '2026-09-29',
  horaLocal: '17:00',
  minutoPared: 1020,
  duracionMinutos: 50,
  columna: 0,
  columnasEnGrupo: 1,
  rango: '17:00–17:50',
  duracion: '50 min',
  nombrePaciente: 'Ana García López',
  nombreCorto: 'Ana G.',
  profesionalNombre: 'Lucía Márquez',
  colorProfesional: 1,
  tipoNombre: null,
  centroNombre: null,
  sala: null,
  notaOperativa: null,
  estado: 'programada',
  late: false,
  deSerie: true,
  desviada: false,
  motivoDesviacion: null,
  reprogramable: true,
  alcanceSiguientesPermitido: true,
  propuestaPendiente: null,
  notas: { mostrar: false, href: '', primario: false, diasPendiente: null },
  ...extra,
});

const DIAS: DiaVista[] = [
  {
    fecha: '2026-10-01',
    numero: '1',
    etiquetaCorta: 'jue',
    etiquetaLarga: 'jueves, 1 de octubre de 2026',
    esHoy: false,
    delMes: true,
  },
];

type PreviaOk = Extract<ResultadoPrevisualizar, { ok: true }>;

const previaLista = (extra: Partial<PreviaOk> = {}): ResultadoPrevisualizar => ({
  ok: true,
  destino: 'Mover a jueves, 1 de octubre de 2026 · 10:00',
  general: null,
  modificar: {
    disponible: true,
    firma: FIRMA,
    descripcion: {
      ahora: 'Ahora: los martes a las 17:00.',
      despues: 'Esta y las siguientes pasarán a ser los jueves a las 10:00.',
      alcance: 'Afecta a 4 citas, del 1 de octubre al 22 de octubre.',
      avisos: ['1 cita quedará sin hora y se decidirá a mano en «Por confirmar».'],
    },
  },
  ...extra,
});

const alCerrar = vi.fn();
const alMovida = vi.fn();

function Montaje({ c = cita(), desdeArrastre = true }: { c?: CitaVista; desdeArrastre?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir
      </button>
      {abierto && (
        <DialogoReprogramar
          cita={c}
          zona="Europe/Madrid"
          dias={DIAS}
          inicial={{ fecha: '2026-10-01', hora: '10:00' }}
          desdeArrastre={desdeArrastre}
          alCerrar={() => {
            alCerrar();
            setAbierto(false);
          }}
          alMovida={alMovida}
        />
      )}
    </>
  );
}

async function abrir(props: Parameters<typeof Montaje>[0] = {}) {
  const usuario = userEvent.setup();
  render(<Montaje {...props} />);
  await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
  return usuario;
}

const radioMantener = () => screen.getByRole('radio', { name: /Mantener la serie/ });
const radioModificar = () => screen.getByRole('radio', { name: /Modificar la serie desde esta cita/ });

describe('DialogoReprogramar · cita de una serie', () => {
  beforeEach(() => {
    reprogramar.mockReset();
    previsualizarMovimiento.mockReset();
    alCerrar.mockReset();
    alMovida.mockReset();
    previsualizarMovimiento.mockResolvedValue(previaLista());
  });

  it('M9 · exactamente dos opciones, ninguna marcada, y nunca «todas»', async () => {
    await abrir();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(screen.queryByText(/todas/i)).toBeNull();
  });

  it('tras un arrastre el foco inicial está en el primer radio, no en la «X»', async () => {
    await abrir();
    expect(radioMantener()).toHaveFocus();
  });

  it('desde el panel el foco inicial está en el campo del día', async () => {
    await abrir({ desdeArrastre: false });
    expect(screen.getByLabelText('Día')).toHaveFocus();
  });

  it('«Modificar» queda desactivado mientras se calcula, con el texto «Calculando…»', async () => {
    previsualizarMovimiento.mockReturnValue(new Promise(() => {}));
    await abrir();
    expect(radioModificar()).toBeDisabled();
    expect(screen.getByText(/Calculando en qué se convierte la serie/)).toBeInTheDocument();
    expect(radioMantener()).toBeEnabled();
  });

  it('con la previsualización lista, la frase de la serie es la descripción del radio «Modificar»', async () => {
    await abrir();
    await waitFor(() => expect(radioModificar()).toBeEnabled());
    const region = document.getElementById(radioModificar().getAttribute('aria-describedby')!)!;
    expect(region).toHaveTextContent('Ahora: los martes a las 17:00.');
    expect(region).toHaveTextContent('Esta y las siguientes pasarán a ser los jueves a las 10:00.');
    expect(region).toHaveTextContent('Afecta a 4 citas');
    expect(region).toHaveTextContent('1 cita quedará sin hora');
    expect(screen.getByText('Mover a jueves, 1 de octubre de 2026 · 10:00')).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('con «modificar» bloqueado, el radio va desactivado y el motivo se ve como texto descrito por el radio', async () => {
    previsualizarMovimiento.mockResolvedValue(
      previaLista({
        modificar: {
          disponible: false,
          mensaje: 'La serie está en otra zona horaria que esta cita; mueve solo esta cita.',
        },
      }),
    );
    await abrir();
    await waitFor(() => expect(radioModificar()).toBeDisabled());
    const region = document.getElementById(radioModificar().getAttribute('aria-describedby')!)!;
    expect(region).toHaveTextContent('La serie está en otra zona horaria');
    expect(radioMantener()).toBeEnabled();
  });

  it('con «sin cambio» se bloquean las dos opciones', async () => {
    previsualizarMovimiento.mockResolvedValue(
      previaLista({
        general: 'La cita ya está en ese día y a esa hora.',
        modificar: { disponible: false, mensaje: 'La cita ya está en ese día y a esa hora.' },
      }),
    );
    await abrir();
    await waitFor(() => expect(radioMantener()).toBeDisabled());
    expect(radioModificar()).toBeDisabled();
  });

  it('Mover sin elegir muestra «elige» y enfoca el primer radio; no llama a reprogramar', async () => {
    const usuario = await abrir({ desdeArrastre: false });
    await waitFor(() => expect(radioModificar()).toBeEnabled());
    await usuario.click(screen.getByRole('button', { name: 'Mover' }));
    expect(await screen.findByText('Elige qué pasa con la serie.')).toBeInTheDocument();
    await waitFor(() => expect(radioMantener()).toHaveFocus());
    expect(screen.getByRole('group')).toHaveAttribute('aria-invalid', 'true');
    expect(reprogramar).not.toHaveBeenCalled();
  });

  it('«Mantener» envía alcance «esta», sin firma', async () => {
    reprogramar.mockResolvedValue({ ok: true, anuncio: 'Cita movida.' } satisfies ResultadoAccion);
    const usuario = await abrir();
    await waitFor(() => expect(radioModificar()).toBeEnabled());
    await usuario.click(radioMantener());
    await usuario.click(screen.getByRole('button', { name: 'Mover' }));
    await waitFor(() => expect(reprogramar).toHaveBeenCalledTimes(1));
    expect(reprogramar).toHaveBeenCalledWith({
      citaId: CITA_ID,
      fecha: '2026-10-01',
      hora: '10:00',
      zona: 'Europe/Madrid',
      alcance: 'esta',
    });
    await waitFor(() => expect(alMovida).toHaveBeenCalledWith('Cita movida.'));
  });

  it('«Modificar» envía alcance «esta_y_siguientes» con la firma de la última previsualización', async () => {
    reprogramar.mockResolvedValue({ ok: true, anuncio: 'Cita movida. La serie ha cambiado.' } satisfies ResultadoAccion);
    const usuario = await abrir();
    await waitFor(() => expect(radioModificar()).toBeEnabled());
    await usuario.click(radioModificar());
    await usuario.click(screen.getByRole('button', { name: 'Mover' }));
    await waitFor(() => expect(reprogramar).toHaveBeenCalledTimes(1));
    expect(reprogramar).toHaveBeenCalledWith({
      citaId: CITA_ID,
      fecha: '2026-10-01',
      hora: '10:00',
      zona: 'Europe/Madrid',
      alcance: 'esta_y_siguientes',
      firma: FIRMA,
    });
  });

  it('cambiar la hora vuelve a previsualizar con el destino nuevo', async () => {
    await abrir({ desdeArrastre: false });
    await waitFor(() => expect(previsualizarMovimiento).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '11:30' } });
    await waitFor(() => expect(previsualizarMovimiento).toHaveBeenCalledTimes(2));
    expect(previsualizarMovimiento).toHaveBeenLastCalledWith({
      citaId: CITA_ID,
      fecha: '2026-10-01',
      hora: '11:30',
      zona: 'Europe/Madrid',
    });
  });

  it('Escape cancela sin llamar a ninguna acción y el foco vuelve a quien abrió', async () => {
    const usuario = await abrir();
    await usuario.keyboard('{Escape}');
    expect(reprogramar).not.toHaveBeenCalled();
    expect(alCerrar).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus();
  });

  it('una previsualización caducada deja el diálogo abierto, lo dice y vuelve a previsualizar', async () => {
    reprogramar.mockResolvedValue({
      ok: false,
      motivo: 'previsualizacion_caducada',
      detalle: null,
      mensaje: 'x',
    } satisfies ResultadoAccion);
    const usuario = await abrir();
    await waitFor(() => expect(radioModificar()).toBeEnabled());
    await usuario.click(radioModificar());
    await usuario.click(screen.getByRole('button', { name: 'Mover' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La serie ha cambiado mientras decidías.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(previsualizarMovimiento).toHaveBeenCalledTimes(2));
    expect(alMovida).not.toHaveBeenCalled();
  });

  it('otro fallo va a un role="alert" con su texto y el diálogo sigue abierto', async () => {
    reprogramar.mockResolvedValue({
      ok: false,
      motivo: 'hueco_ocupado',
      detalle: null,
      mensaje: 'Ese hueco ya está ocupado.',
    } satisfies ResultadoAccion);
    const usuario = await abrir();
    await waitFor(() => expect(radioModificar()).toBeEnabled());
    await usuario.click(radioMantener());
    await usuario.click(screen.getByRole('button', { name: 'Mover' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ese hueco ya está ocupado.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('mientras se envía, Escape no cierra el diálogo', async () => {
    reprogramar.mockReturnValue(new Promise(() => {}));
    const usuario = await abrir();
    await waitFor(() => expect(radioModificar()).toBeEnabled());
    await usuario.click(radioMantener());
    await usuario.click(screen.getByRole('button', { name: 'Mover' }));
    expect(await screen.findByRole('button', { name: 'Moviendo…' })).toHaveAttribute('aria-disabled', 'true');
    await usuario.keyboard('{Escape}');
    expect(alCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('DialogoReprogramar · cita suelta', () => {
  beforeEach(() => {
    reprogramar.mockReset();
    previsualizarMovimiento.mockReset();
    alMovida.mockReset();
  });

  it('no hay grupo de opciones ni previsualización, y Mover envía sin alcance', async () => {
    reprogramar.mockResolvedValue({
      ok: true,
      anuncio: 'Cita movida al 1 de octubre a las 10:00.',
    } satisfies ResultadoAccion);
    const usuario = await abrir({ c: cita({ deSerie: false, alcanceSiguientesPermitido: false }), desdeArrastre: true });
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('Mover a jueves, 1 de octubre de 2026 · 10:00')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Mover' }));
    await waitFor(() =>
      expect(reprogramar).toHaveBeenCalledWith({
        citaId: CITA_ID,
        fecha: '2026-10-01',
        hora: '10:00',
        zona: 'Europe/Madrid',
      }),
    );
    expect(previsualizarMovimiento).not.toHaveBeenCalled();
  });
});
