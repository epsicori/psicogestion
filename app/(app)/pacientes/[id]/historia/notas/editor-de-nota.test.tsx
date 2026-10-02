import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModeloDeNota, VersionDeVista } from '@/lib/notas/servidor';

const abrirEditorDeNota = vi.fn();
const guardarBorrador = vi.fn();
const fijarCoprofesional = vi.fn();
const empezarModificacion = vi.fn();
const firmarNota = vi.fn();
const ampliarLaVentana = vi.fn();
const cerrarHistoriaDelPaciente = vi.fn();

vi.mock('./acciones', () => ({
  abrirEditorDeNota: (...a: unknown[]) => abrirEditorDeNota(...a),
  guardarBorrador: (...a: unknown[]) => guardarBorrador(...a),
  fijarCoprofesional: (...a: unknown[]) => fijarCoprofesional(...a),
  empezarModificacion: (...a: unknown[]) => empezarModificacion(...a),
  firmarNota: (...a: unknown[]) => firmarNota(...a),
}));
vi.mock('../../acciones', () => ({
  ampliarLaVentana: () => ampliarLaVentana(),
  cerrarHistoriaDelPaciente: () => cerrarHistoriaDelPaciente(),
}));
vi.mock('@/app/(app)/candado/acciones', () => ({ abrirHistoria: vi.fn() }));

const { EditorDeNota } = await import('./editor-de-nota');

const PACIENTE = '11111111-1111-4111-8111-111111111111';
const NOTA = '22222222-2222-4222-8222-222222222222';
const CITA = '33333333-3333-4333-8333-333333333333';

function modelo(extra: Partial<ModeloDeNota> = {}): ModeloDeNota {
  return {
    notaId: NOTA,
    soyAutor: true,
    estado: 'borrador',
    cabecera: { fechaSesion: '1 de octubre', horario: null, episodio: 'Individual', coprofesional: null },
    borrador: { texto: 'Texto base', reservadas: '', testigo: 'T0' },
    borradorOculto: false,
    lecturaConjunta: false,
    versiones: [],
    candidatosCoprofesional: [],
    puedeSerConjunta: false,
    ...extra,
  };
}

function version(numero: number, extra: Partial<VersionDeVista> = {}): VersionDeVista {
  return {
    numero,
    autor: 'Ana Pérez',
    firmadaEn: '1 oct 2026, 10:00',
    motivo: numero > 1 ? 'Corrección' : null,
    alcance: 'individual',
    texto: `Texto firmado ${numero}`,
    reservadas: null,
    sello: 'Firmada en sesión',
    enSesion: true,
    margen: null,
    huellaCorta: 'abcdef012345',
    ...extra,
  };
}

const enMinutos = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

let ancho = true;

/** Deja correr las promesas pendientes sin avanzar el reloj. */
const vaciar = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

const avanzar = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

async function montar(nota: ModeloDeNota = modelo(), caducaEn: string = enMinutos(30)) {
  abrirEditorDeNota.mockResolvedValue({ estado: 'abierta', caducaEn, nota });
  render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir el editor' }));
  await vaciar();
}

const cuerpo = () => screen.getByRole('textbox', { name: 'Nota' }) as HTMLTextAreaElement;
const escribir = (valor: string) => fireEvent.change(cuerpo(), { target: { value: valor } });

async function abrirDialogoDeFirma() {
  fireEvent.click(screen.getByRole('button', { name: 'Firmar' }));
  await vaciar();
  return screen.getByRole('dialog');
}

async function confirmar(dialogo: HTMLElement) {
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Firmar' }));
  await vaciar();
  // La transición asíncrona de React termina un ciclo después de la última promesa.
  await vaciar();
}

describe('EditorDeNota', () => {
  beforeEach(() => {
    // Sin `setImmediate`: es lo que usa el planificador de React, y si el reloj falso se lleva
    // una tarea suya pendiente al restaurarse, las transiciones del test siguiente no terminan.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    ancho = true;
    window.matchMedia = vi.fn().mockImplementation((consulta: string) => ({
      matches: ancho,
      media: consulta,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    for (const f of [
      abrirEditorDeNota,
      guardarBorrador,
      fijarCoprofesional,
      empezarModificacion,
      firmarNota,
      ampliarLaVentana,
      cerrarHistoriaDelPaciente,
    ]) {
      f.mockReset();
    }
    cerrarHistoriaDelPaciente.mockResolvedValue({ cerradas: 1 });
    guardarBorrador.mockResolvedValue({ ok: true, testigo: 'T1', caducaEn: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('apertura', () => {
    it('al montar no abre nada: solo tras el clic en «Abrir el editor» (ADR-058.3)', async () => {
      abrirEditorDeNota.mockResolvedValue({ estado: 'no_disponible' });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      await vaciar();
      expect(abrirEditorDeNota).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Abrir el editor' }));
      await vaciar();
      expect(abrirEditorDeNota).toHaveBeenCalledTimes(1);
      expect(abrirEditorDeNota).toHaveBeenCalledWith({
        pacienteId: PACIENTE,
        citaId: CITA,
        notaId: null,
        episodioId: null,
      });
    });

    it('un doble clic en «Abrir el editor» abre una sola vez', async () => {
      abrirEditorDeNota.mockReturnValue(new Promise(() => {}));
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      const boton = screen.getByRole('button', { name: 'Abrir el editor' });
      fireEvent.click(boton);
      fireEvent.click(boton);
      await vaciar();
      expect(abrirEditorDeNota).toHaveBeenCalledTimes(1);
    });

    it('bloqueada → formulario de PIN; tras el PIN, bloqueada otra vez → «No se puede abrir…» sin PIN', async () => {
      abrirEditorDeNota.mockResolvedValue({ estado: 'bloqueada' });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      fireEvent.click(screen.getByRole('button', { name: 'Abrir el editor' }));
      await vaciar();
      expect(screen.getByText('Esta historia está cerrada')).toBeInTheDocument();
      expect(screen.getByLabelText('PIN')).toBeInTheDocument();

      const { abrirHistoria } = await import('@/app/(app)/candado/acciones');
      vi.mocked(abrirHistoria).mockResolvedValue({ abierta: true } as never);
      fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '111111' } });
      fireEvent.submit(screen.getByLabelText('PIN').closest('form')!);
      await vaciar();

      expect(abrirEditorDeNota).toHaveBeenCalledTimes(2);
      expect(screen.getByText('No se puede abrir la historia de este paciente.')).toBeInTheDocument();
      expect(screen.queryByLabelText('PIN')).toBeNull();
    });

    it('error → «Volver a intentarlo» y ningún formulario de PIN; el botón reabre', async () => {
      abrirEditorDeNota.mockResolvedValueOnce({ estado: 'error' });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      fireEvent.click(screen.getByRole('button', { name: 'Abrir el editor' }));
      await vaciar();
      expect(screen.getByText('No se pudo abrir la nota. Vuelve a intentarlo.')).toBeInTheDocument();
      expect(screen.queryByLabelText('PIN')).toBeNull();

      abrirEditorDeNota.mockResolvedValueOnce({ estado: 'abierta', caducaEn: enMinutos(30), nota: modelo() });
      fireEvent.click(screen.getByRole('button', { name: 'Volver a intentarlo' }));
      await vaciar();
      expect(abrirEditorDeNota).toHaveBeenCalledTimes(2);
      expect(cuerpo().value).toBe('Texto base');
    });

    it('una acción que rechaza acaba en «error», no en un esqueleto eterno', async () => {
      abrirEditorDeNota.mockRejectedValue(new Error('red'));
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      fireEvent.click(screen.getByRole('button', { name: 'Abrir el editor' }));
      await vaciar();
      expect(screen.getByRole('button', { name: 'Volver a intentarlo' })).toBeInTheDocument();
    });

    it('no_disponible pinta su frase', async () => {
      abrirEditorDeNota.mockResolvedValue({ estado: 'no_disponible' });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      fireEvent.click(screen.getByRole('button', { name: 'Abrir el editor' }));
      await vaciar();
      expect(screen.getByText('Esta nota no está disponible.')).toBeInTheDocument();
    });

    it('elegir_episodio: sin episodios lo dice; con ellos, continuar abre con el elegido', async () => {
      abrirEditorDeNota.mockResolvedValueOnce({
        estado: 'elegir_episodio',
        episodios: [
          { id: '44444444-4444-4444-8444-444444444444', etiqueta: 'Individual · ene 2026' },
          { id: '55555555-5555-4555-8555-555555555555', etiqueta: 'Pareja · mar 2026' },
        ],
      });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      fireEvent.click(screen.getByRole('button', { name: 'Abrir el editor' }));
      await vaciar();

      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByRole('option', { name: 'Pareja · mar 2026' }));
      abrirEditorDeNota.mockResolvedValueOnce({ estado: 'abierta', caducaEn: enMinutos(30), nota: modelo() });
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      await vaciar();

      expect(abrirEditorDeNota).toHaveBeenLastCalledWith({
        pacienteId: PACIENTE,
        citaId: CITA,
        notaId: null,
        episodioId: '55555555-5555-4555-8555-555555555555',
      });
    });

    it('elegir_episodio con la lista vacía dice que no hay episodios', async () => {
      abrirEditorDeNota.mockResolvedValue({ estado: 'elegir_episodio', episodios: [] });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      fireEvent.click(screen.getByRole('button', { name: 'Abrir el editor' }));
      await vaciar();
      expect(screen.getByText('No tienes ningún episodio abierto con este paciente.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    });
  });

  describe('autoguardado', () => {
    it('3 s tras la última tecla guarda con el testigo y lo último escrito', async () => {
      await montar();
      escribir('Uno');
      await avanzar(2000);
      escribir('Uno dos');
      await avanzar(2000);
      expect(guardarBorrador).not.toHaveBeenCalled();
      await avanzar(1000);
      expect(guardarBorrador).toHaveBeenCalledTimes(1);
      expect(guardarBorrador).toHaveBeenCalledWith({
        pacienteId: PACIENTE,
        notaId: NOTA,
        testigo: 'T0',
        texto: 'Uno dos',
        reservadas: '',
      });
      expect(screen.getByText('Guardado')).toBeInTheDocument();
    });

    it('el testigo devuelto es el que viaja en el guardado siguiente', async () => {
      await montar();
      escribir('Uno');
      await avanzar(3000);
      escribir('Uno dos');
      await avanzar(3000);
      expect(guardarBorrador).toHaveBeenCalledTimes(2);
      expect(guardarBorrador.mock.calls[1]![0]).toMatchObject({ testigo: 'T1', texto: 'Uno dos' });
    });

    it('el blur guarda sin esperar los 3 s', async () => {
      await montar();
      escribir('Cambio');
      fireEvent.blur(cuerpo());
      await vaciar();
      expect(guardarBorrador).toHaveBeenCalledTimes(1);
    });

    it('sin cambios, el blur no guarda', async () => {
      await montar();
      fireEvent.blur(cuerpo());
      await vaciar();
      expect(guardarBorrador).not.toHaveBeenCalled();
    });

    it('un guardado que falla marca «No se ha podido guardar» y no reintenta solo; la tecla siguiente sí', async () => {
      guardarBorrador.mockResolvedValueOnce({ ok: false, motivo: 'error' });
      await montar();
      escribir('Uno');
      await avanzar(3000);
      expect(screen.getByText(/No se ha podido guardar/)).toBeInTheDocument();
      await avanzar(10_000);
      expect(guardarBorrador).toHaveBeenCalledTimes(1);
      escribir('Uno dos');
      await avanzar(3000);
      expect(guardarBorrador).toHaveBeenCalledTimes(2);
    });

    it('nunca hay dos guardados en vuelo: lo escrito durante uno se guarda después, con lo último', async () => {
      let resolver: (v: unknown) => void = () => {};
      guardarBorrador.mockReturnValueOnce(new Promise((r) => (resolver = r)));
      await montar();
      escribir('Uno');
      fireEvent.blur(cuerpo());
      await vaciar();
      expect(guardarBorrador).toHaveBeenCalledTimes(1);

      escribir('Uno dos');
      fireEvent.blur(cuerpo());
      await vaciar();
      expect(guardarBorrador).toHaveBeenCalledTimes(1);

      resolver({ ok: true, testigo: 'T1', caducaEn: null });
      await vaciar();
      expect(guardarBorrador).toHaveBeenCalledTimes(2);
      expect(guardarBorrador.mock.calls[1]![0]).toMatchObject({ testigo: 'T1', texto: 'Uno dos' });
    });
  });

  describe('reloj', () => {
    it('un guardado con caducaEn null NO borra el plazo: al llegar T el texto desaparece y sale «se ha cerrado sola»', async () => {
      await montar(modelo(), enMinutos(10));
      escribir('Texto que no debe sobrevivir');
      await avanzar(3000); // guarda y devuelve caducaEn: null
      expect(guardarBorrador).toHaveBeenCalledTimes(1);
      await avanzar(9 * 60_000);
      expect(screen.getByLabelText('Nota')).toBeInTheDocument();
      await avanzar(60_000);
      expect(screen.queryByLabelText('Nota')).toBeNull();
      expect(screen.queryByDisplayValue('Texto que no debe sobrevivir')).toBeNull();
      expect(screen.getByText(/La historia se ha cerrado sola/)).toBeInTheDocument();
      expect(screen.getByLabelText('PIN')).toBeInTheDocument();
    });

    it('un guardado con caducaEn nuevo mueve el plazo', async () => {
      guardarBorrador.mockResolvedValue({ ok: true, testigo: 'T1', caducaEn: enMinutos(40) });
      await montar(modelo(), enMinutos(10));
      escribir('Uno');
      await avanzar(3000);
      await avanzar(15 * 60_000);
      expect(screen.getByLabelText('Nota')).toBeInTheDocument();
    });

    it('ampliar con caducaEn null conserva el plazo anterior', async () => {
      ampliarLaVentana.mockResolvedValue({ caducaEn: null });
      await montar(modelo(), enMinutos(2));
      fireEvent.click(screen.getByRole('button', { name: 'Ampliar el tiempo' }));
      await vaciar();
      expect(ampliarLaVentana).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('Nota')).toBeInTheDocument();
      await avanzar(2 * 60_000);
      expect(screen.queryByLabelText('Nota')).toBeNull();
      expect(screen.getByText(/La historia se ha cerrado sola/)).toBeInTheDocument();
    });

    it('ampliar con un plazo nuevo lo aplica', async () => {
      ampliarLaVentana.mockResolvedValue({ caducaEn: enMinutos(30) });
      await montar(modelo(), enMinutos(2));
      fireEvent.click(screen.getByRole('button', { name: 'Ampliar el tiempo' }));
      await vaciar();
      await avanzar(5 * 60_000);
      expect(screen.getByLabelText('Nota')).toBeInTheDocument();
    });

    it('el aviso de «se va a cerrar» no roba el foco y solo sale con 2 min o menos', async () => {
      await montar(modelo(), enMinutos(30));
      expect(screen.queryByRole('button', { name: 'Ampliar el tiempo' })).toBeNull();
      cuerpo().focus();
      await avanzar(29 * 60_000);
      expect(screen.getByRole('button', { name: 'Ampliar el tiempo' })).toBeInTheDocument();
      expect(screen.getByText('Se va a cerrar en breve. Si sigues trabajando, amplía el tiempo.')).toBeInTheDocument();
      expect(document.activeElement).toBe(cuerpo());
    });

    it('«Cerrar la historia» espera al guardado en vuelo y luego cierra', async () => {
      let resolver: (v: unknown) => void = () => {};
      guardarBorrador.mockReturnValueOnce(new Promise((r) => (resolver = r)));
      await montar();
      escribir('Pendiente');
      fireEvent.blur(cuerpo());
      await vaciar();
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar la historia' }));
      await vaciar();
      expect(cerrarHistoriaDelPaciente).not.toHaveBeenCalled();
      resolver({ ok: true, testigo: 'T1', caducaEn: null });
      await vaciar();
      expect(cerrarHistoriaDelPaciente).toHaveBeenCalledTimes(1);
      expect(screen.queryByLabelText('Nota')).toBeNull();
      expect(screen.getByLabelText('PIN')).toBeInTheDocument();
    });

    it('un guardado «bloqueada» vacía el modelo y pide el PIN', async () => {
      guardarBorrador.mockResolvedValue({ ok: false, motivo: 'bloqueada' });
      await montar();
      escribir('Secreto');
      await avanzar(3000);
      expect(screen.queryByDisplayValue('Secreto')).toBeNull();
      expect(screen.getByLabelText('PIN')).toBeInTheDocument();
    });
  });

  describe('conflicto', () => {
    it('al firmar: el texto sigue en un textarea readOnly, no hay más guardados, el foco va al aviso y «Cargar lo guardado» recarga', async () => {
      firmarNota.mockResolvedValue({ ok: false, motivo: 'conflicto' });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(cuerpo().value).toBe('Texto base');
      expect(cuerpo().readOnly).toBe(true);
      // El foco va a un control con rol y nombre, no a un contenedor anónimo (B0-H6).
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cargar lo guardado' }));

      fireEvent.change(cuerpo(), { target: { value: 'Tecleo tras el conflicto' } });
      fireEvent.blur(cuerpo());
      await avanzar(10_000);
      expect(guardarBorrador).not.toHaveBeenCalled();

      abrirEditorDeNota.mockResolvedValueOnce({
        estado: 'abierta',
        caducaEn: enMinutos(30),
        nota: modelo({ borrador: { texto: 'Texto del servidor', reservadas: '', testigo: 'T9' } }),
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cargar lo guardado' }));
      await vaciar();
      expect(abrirEditorDeNota).toHaveBeenLastCalledWith({
        pacienteId: PACIENTE,
        citaId: null,
        notaId: NOTA,
        episodioId: null,
      });
      expect(cuerpo().value).toBe('Texto del servidor');
      expect(cuerpo().readOnly).toBe(false);
      expect(screen.queryByText(/La nota ha cambiado desde otro sitio/)).toBeNull();
    });

    it('un conflicto al autoguardar también deja readOnly y para el autoguardado', async () => {
      guardarBorrador.mockResolvedValue({ ok: false, motivo: 'conflicto' });
      await montar();
      escribir('Mío');
      await avanzar(3000);
      expect(cuerpo().readOnly).toBe(true);
      expect(cuerpo().value).toBe('Mío');
      await avanzar(10_000);
      expect(guardarBorrador).toHaveBeenCalledTimes(1);
    });

    it('sin_borrador al guardar: «ya se ha firmado desde otro sitio» con «Cargar lo guardado»', async () => {
      guardarBorrador.mockResolvedValue({ ok: false, motivo: 'sin_borrador' });
      await montar();
      escribir('Mío');
      await avanzar(3000);
      expect(screen.getByText('Esta nota ya se ha firmado desde otro sitio.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cargar lo guardado' })).toBeInTheDocument();
    });
  });

  describe('firmar', () => {
    it('B: con la firma en vuelo, dos clics (también fireEvent) y dos submit llaman a firmarNota UNA vez y los botones quedan desactivados', async () => {
      // Se resuelve al final: una transición asíncrona que nunca termina queda en la cola global de
      // React y deja «pendiente» a las transiciones de los tests siguientes.
      let terminar: (v: unknown) => void = () => {};
      firmarNota.mockReturnValue(new Promise((r) => (terminar = r)));
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      const confirma = within(dialogo).getByRole('button', { name: 'Firmar' });
      fireEvent.click(confirma);
      fireEvent.click(confirma);
      fireEvent.submit(dialogo.querySelector('form')!);
      fireEvent.submit(dialogo.querySelector('form')!);
      await vaciar();
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Firmando…' }));
      await vaciar();

      expect(firmarNota).toHaveBeenCalledTimes(1);
      expect(within(dialogo).getByRole('button', { name: 'Firmando…' })).toBeDisabled();
      expect(screen.getAllByRole('button', { name: 'Firmar' }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);

      terminar({ ok: false, motivo: 'error' });
      await vaciar();
      await vaciar();
    });

    it('sin cambios sin guardar, firma con el testigo que tiene y no guarda antes', async () => {
      firmarNota.mockResolvedValue({ ok: true, nota: modelo({ estado: 'firmada', borrador: null, versiones: [version(1)] }), caducaEn: null });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(guardarBorrador).not.toHaveBeenCalled();
      expect(firmarNota).toHaveBeenCalledWith({
        pacienteId: PACIENTE,
        notaId: NOTA,
        testigo: 'T0',
        alcance: 'individual',
        motivo: null,
      });
    });

    it('con cambios sin guardar, guarda primero y firma con el testigo NUEVO', async () => {
      const orden: string[] = [];
      guardarBorrador.mockImplementation(async () => {
        orden.push('guardar');
        return { ok: true, testigo: 'T7', caducaEn: null };
      });
      firmarNota.mockImplementation(async () => {
        orden.push('firmar');
        return { ok: true, nota: modelo({ estado: 'firmada', borrador: null, versiones: [version(1)] }), caducaEn: null };
      });
      await montar();
      escribir('Cambio sin guardar');
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(orden).toEqual(['guardar', 'firmar']);
      expect(firmarNota.mock.calls[0]![0]).toMatchObject({ testigo: 'T7' });
    });

    it('si el guardado previo da conflicto, NO se llama a firmarNota', async () => {
      guardarBorrador.mockResolvedValue({ ok: false, motivo: 'conflicto' });
      await montar();
      escribir('Cambio sin guardar');
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(firmarNota).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(cuerpo().readOnly).toBe(true);
    });

    it('si el guardado previo falla por error, NO firma y el diálogo sigue con «No se pudo firmar»', async () => {
      guardarBorrador.mockResolvedValue({ ok: false, motivo: 'error' });
      await montar();
      escribir('Cambio sin guardar');
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(firmarNota).not.toHaveBeenCalled();
      expect(within(screen.getByRole('dialog')).getByText('No se pudo firmar. Vuelve a intentarlo.')).toBeInTheDocument();
    });

    it('sin puedeSerConjunta no hay ningún radio; con él, dos y las tres frases', async () => {
      await montar(modelo({ puedeSerConjunta: false }));
      const dialogo = await abrirDialogoDeFirma();
      expect(within(dialogo).queryAllByRole('radio')).toHaveLength(0);
      expect(within(dialogo).queryByText('Alcance')).toBeNull();
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
      await vaciar();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('con puedeSerConjunta, dos radios con las frases, y la elección viaja', async () => {
      firmarNota.mockResolvedValue({ ok: true, nota: modelo({ estado: 'firmada', borrador: null, versiones: [version(1)] }), caducaEn: null });
      await montar(modelo({ puedeSerConjunta: true }));
      const dialogo = await abrirDialogoDeFirma();
      expect(within(dialogo).getAllByRole('radio')).toHaveLength(2);
      expect(within(dialogo).getByRole('group', { name: 'Alcance' })).toBeInTheDocument();
      expect(within(dialogo).getByText('La leerán los profesionales del episodio.')).toBeInTheDocument();
      expect(within(dialogo).getByText('Es un solo eslabón de la cadena.')).toBeInTheDocument();
      expect(within(dialogo).getByText('No se entregará entera en un acceso individual.')).toBeInTheDocument();
      fireEvent.click(within(dialogo).getByRole('radio', { name: 'Nota conjunta del episodio' }));
      await confirmar(dialogo);
      expect(firmarNota.mock.calls[0]![0]).toMatchObject({ alcance: 'conjunta' });
    });

    it('con versiones, confirmar con el motivo vacío no firma y pinta «hace falta un motivo»', async () => {
      await montar(
        modelo({ estado: 'firmada_con_cambios', versiones: [version(1)] }),
      );
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(firmarNota).not.toHaveBeenCalled();
      expect(within(dialogo).getByText('Para modificar una nota firmada hace falta un motivo.')).toBeInTheDocument();

      fireEvent.change(within(dialogo).getByLabelText('Motivo del cambio'), { target: { value: '   ' } });
      await confirmar(dialogo);
      expect(firmarNota).not.toHaveBeenCalled();
    });

    it('con versiones y motivo, el motivo viaja', async () => {
      firmarNota.mockResolvedValue({ ok: true, nota: modelo({ estado: 'modificada', borrador: null, versiones: [version(1), version(2)] }), caducaEn: null });
      await montar(modelo({ estado: 'firmada_con_cambios', versiones: [version(1)] }));
      const dialogo = await abrirDialogoDeFirma();
      fireEvent.change(within(dialogo).getByLabelText('Motivo del cambio'), { target: { value: 'Corrijo la fecha' } });
      await confirmar(dialogo);
      expect(firmarNota.mock.calls[0]![0]).toMatchObject({ motivo: 'Corrijo la fecha' });
    });

    it('ok con nota: cierra el diálogo, pinta la versión vigente y le da el foco', async () => {
      firmarNota.mockResolvedValue({
        ok: true,
        nota: modelo({ estado: 'firmada', borrador: null, versiones: [version(1)] }),
        caducaEn: null,
      });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByLabelText('Nota')).toBeNull();
      expect(screen.getByText('Texto firmado 1')).toBeInTheDocument();
      const titulo = screen.getByRole('heading', { name: 'Versión vigente' });
      expect(document.activeElement).toBe(titulo);
    });

    it('ok con nota null: «Firmada. No se pudo recargar la nota.», botón Recargar y cuerpos de solo lectura', async () => {
      firmarNota.mockResolvedValue({ ok: true, nota: null, caducaEn: null });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByText('Firmada. No se pudo recargar la nota.')).toBeInTheDocument();
      expect(cuerpo().readOnly).toBe(true);
      expect(screen.queryByRole('button', { name: 'Firmar' })).toBeNull();

      abrirEditorDeNota.mockResolvedValueOnce({
        estado: 'abierta',
        caducaEn: enMinutos(30),
        nota: modelo({ estado: 'firmada', borrador: null, versiones: [version(1)] }),
      });
      fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
      await vaciar();
      expect(abrirEditorDeNota).toHaveBeenLastCalledWith({ pacienteId: PACIENTE, citaId: null, notaId: NOTA, episodioId: null });
      expect(screen.getByText('Texto firmado 1')).toBeInTheDocument();
    });

    it('B0-H4 · dos envíos en el MISMO tick (antes de que el botón se desactive) firman una sola vez, aunque la primera acabe en error', async () => {
      // `fireEvent` envuelve cada gesto en su propio `act`: entre dos el botón ya está desactivado
      // y el guardián `enVuelo` no se ejerce. Aquí los dos envíos caen en un solo `act`, que es
      // lo que pasa con un doble clic real más rápido que el repintado.
      let terminar: (v: unknown) => void = () => {};
      firmarNota.mockReturnValue(new Promise((r) => (terminar = r)));
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      const formulario = dialogo.querySelector('form')!;
      await act(async () => {
        formulario.requestSubmit();
        formulario.requestSubmit();
      });
      await vaciar();
      terminar({ ok: false, motivo: 'error' });
      await vaciar();
      await vaciar();
      expect(firmarNota).toHaveBeenCalledTimes(1);
    });

    it('vacia → «No se firma una nota vacía» dentro del diálogo, que sigue abierto', async () => {
      firmarNota.mockResolvedValue({ ok: false, motivo: 'vacia' });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(within(screen.getByRole('dialog')).getByText('No se firma una nota vacía.')).toBeInTheDocument();
    });

    it('error → «No se pudo firmar» con role alert y se puede volver a pulsar', async () => {
      firmarNota.mockResolvedValueOnce({ ok: false, motivo: 'error' });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('No se pudo firmar. Vuelve a intentarlo.');
      expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Firmar' })).toBeEnabled();
      firmarNota.mockResolvedValueOnce({ ok: false, motivo: 'error' });
      await confirmar(screen.getByRole('dialog'));
      expect(firmarNota).toHaveBeenCalledTimes(2);
    });

    it('una acción que rechaza no deja el diálogo bloqueado', async () => {
      firmarNota.mockRejectedValueOnce(new Error('red'));
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Firmar' })).toBeEnabled();
      expect(within(screen.getByRole('dialog')).getByText('No se pudo firmar. Vuelve a intentarlo.')).toBeInTheDocument();
    });

    it('bloqueada al firmar vacía el modelo', async () => {
      firmarNota.mockResolvedValue({ ok: false, motivo: 'bloqueada' });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(screen.queryByDisplayValue('Texto base')).toBeNull();
      expect(screen.getByLabelText('PIN')).toBeInTheDocument();
    });

    it('B0-H5 · la firma que no trae la nota (sin_recargar) con caducaEn null no borra el plazo: al llegar T se cierra sola', async () => {
      firmarNota.mockResolvedValue({ ok: true, nota: null, caducaEn: null });
      await montar(modelo(), enMinutos(5));
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(screen.getByText('Firmada. No se pudo recargar la nota.')).toBeInTheDocument();
      await avanzar(5 * 60_000);
      expect(screen.getByText(/La historia se ha cerrado sola/)).toBeInTheDocument();
    });

    it('la firma con caducaEn null no toca el plazo', async () => {
      firmarNota.mockResolvedValue({
        ok: true,
        nota: modelo({ estado: 'firmada', borrador: null, versiones: [version(1)] }),
        caducaEn: null,
      });
      await montar(modelo(), enMinutos(5));
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      await avanzar(5 * 60_000);
      expect(screen.getByText(/La historia se ha cerrado sola/)).toBeInTheDocument();
    });
  });

  describe('lo que se ve según quién y en qué estado', () => {
    it('autor con borrador y sin versiones: dos cuerpos con sus avisos y las acciones', async () => {
      await montar();
      expect(screen.getByLabelText('Nota')).toBeInTheDocument();
      expect(screen.getByLabelText('Anotaciones reservadas')).toBeInTheDocument();
      expect(screen.getByText('Anotaciones reservadas (art. 18.3, Ley 41/2002)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Firmar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Modificar' })).toBeNull();
      expect(cuerpo().maxLength).toBe(60000);
      expect((screen.getByLabelText('Anotaciones reservadas') as HTMLTextAreaElement).maxLength).toBe(20000);
    });

    it('el botón Guardar guarda ya', async () => {
      await montar();
      escribir('Cambio');
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      await vaciar();
      expect(guardarBorrador).toHaveBeenCalledTimes(1);
    });

    it('en pantalla estrecha, dos pestañas y un solo cuerpo a la vez; el texto sobrevive al cambio', async () => {
      ancho = false;
      await montar();
      expect(screen.getByRole('tablist', { name: 'Partes de la nota' })).toBeInTheDocument();
      escribir('Escrito');
      fireEvent.click(screen.getByRole('tab', { name: 'Anotaciones reservadas' }));
      await vaciar();
      expect(screen.queryByLabelText('Nota')).toBeNull();
      fireEvent.click(screen.getByRole('tab', { name: 'Nota' }));
      await vaciar();
      expect(cuerpo().value).toBe('Escrito');
    });

    it('firmada y sin borrador, autor: versión vigente, historial y botón Modificar; Modificar abre el borrador', async () => {
      const firmada = modelo({
        estado: 'firmada',
        borrador: null,
        versiones: [version(1)],
      });
      await montar(firmada);
      expect(screen.queryByLabelText('Nota')).toBeNull();
      expect(screen.getByText('Texto firmado 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Modificar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Firmar' })).toBeNull();

      empezarModificacion.mockResolvedValue({
        ok: true,
        nota: modelo({
          estado: 'firmada_con_cambios',
          versiones: [version(1)],
          borrador: { texto: 'Texto firmado 1', reservadas: '', testigo: 'M0' },
        }),
        caducaEn: null,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Modificar' }));
      await vaciar();
      expect(empezarModificacion).toHaveBeenCalledWith({ pacienteId: PACIENTE, notaId: NOTA });
      expect(cuerpo().value).toBe('Texto firmado 1');
      expect(screen.getByRole('heading', { name: 'Versión vigente' })).toBeInTheDocument();
    });

    it('con varias versiones, una fila por versión, la más nueva primero', async () => {
      await montar(
        modelo({ estado: 'modificada', borrador: null, versiones: [version(1), version(2)] }),
      );
      const filas = screen.getAllByRole('listitem').filter((li) => /Versión \d/.test(li.textContent ?? ''));
      expect(filas[0]!.textContent).toContain('2');
      expect(screen.getByText(/Modificada el/)).toBeInTheDocument();
    });

    it('quien no es el autor: ve lo firmado y el borrador ajeno SIN ningún control de escritura', async () => {
      await montar(
        modelo({
          soyAutor: false,
          estado: 'firmada_con_cambios',
          versiones: [version(1)],
          borrador: { texto: 'Borrador del autor', reservadas: 'Reservado del autor', testigo: 'T0' },
        }),
      );
      expect(screen.getByText('Texto firmado 1')).toBeInTheDocument();
      expect(screen.getByText('Esta nota solo la corrige quien la escribió. Si llevas el caso, escribe una nota nueva.')).toBeInTheDocument();
      expect(screen.getByText('Su autor tiene cambios sin firmar.')).toBeInTheDocument();
      expect(screen.getByText('Borrador del autor')).toBeInTheDocument();
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Firmar' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Modificar' })).toBeNull();
      expect(screen.queryByRole('combobox')).toBeNull();
      // lo firmado va primero
      const firmado = screen.getByText('Texto firmado 1');
      const ajeno = screen.getByText('Borrador del autor');
      expect(firmado.compareDocumentPosition(ajeno) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await avanzar(10_000);
      expect(guardarBorrador).not.toHaveBeenCalled();
    });

    it('B0-H2 · quien solo lee como coprofesional ve «Última versión conjunta» y ninguna pista de versiones individuales', async () => {
      await montar(
        modelo({
          soyAutor: false,
          estado: 'modificada',
          borrador: null,
          lecturaConjunta: true,
          versiones: [version(1, { alcance: 'conjunta' }), version(2, { alcance: 'conjunta' })],
        }),
      );
      expect(screen.getByRole('heading', { name: 'Última versión conjunta' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Versión vigente' })).toBeNull();
      expect(screen.getByRole('list', { name: 'Versiones conjuntas' })).toBeInTheDocument();
      expect(screen.queryByText(/vigente/)).toBeNull();
    });

    it('B0-H2 · el autor y el profesional asignado siguen viendo «Versión vigente»', async () => {
      await montar(modelo({ soyAutor: false, estado: 'firmada', borrador: null, versiones: [version(1)] }));
      expect(screen.getByRole('heading', { name: 'Versión vigente' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Última versión conjunta' })).toBeNull();
    });

    it('B0-H3 · borrador ajeno que no puede leer: solo «Hay un borrador en curso», sin texto ni controles', async () => {
      await montar(
        modelo({
          soyAutor: false,
          estado: 'firmada_con_cambios',
          versiones: [version(1)],
          borrador: null,
          borradorOculto: true,
        }),
      );
      expect(screen.getByText('Hay un borrador en curso.')).toBeInTheDocument();
      expect(screen.queryByText('Su autor tiene cambios sin firmar.')).toBeNull();
      expect(screen.getByText('Texto firmado 1')).toBeInTheDocument();
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
      expect(screen.queryByText('Texto base')).toBeNull();
    });

    it('con dos versiones, «Comparar versiones» está en la sección de la vigente', async () => {
      await montar(modelo({ estado: 'modificada', borrador: null, versiones: [version(1), version(2)] }));
      const seccion = screen.getByRole('region', { name: 'Versión vigente' });
      expect(within(seccion).getByRole('button', { name: 'Comparar versiones' })).toBeInTheDocument();
    });

    it('al llegar una versión nueva, la comparación vuelve a empezar: cerrada y de la penúltima a la vigente', async () => {
      firmarNota.mockResolvedValue({
        ok: true,
        nota: modelo({ estado: 'modificada', borrador: null, versiones: [version(1), version(2), version(3)] }),
        caducaEn: null,
      });
      await montar(modelo({ estado: 'firmada_con_cambios', versiones: [version(1), version(2)] }));
      fireEvent.click(screen.getByRole('button', { name: 'Comparar versiones' }));
      expect(screen.getByRole('region', { name: 'De la versión 1 a la 2' })).toBeInTheDocument();
      const dialogo = await abrirDialogoDeFirma();
      fireEvent.change(within(dialogo).getByLabelText('Motivo del cambio'), { target: { value: 'Corrijo la fecha' } });
      await confirmar(dialogo);
      const boton = screen.getByRole('button', { name: 'Comparar versiones' });
      expect(boton).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(boton);
      expect(screen.getByRole('region', { name: 'De la versión 2 a la 3' })).toBeInTheDocument();
    });

    it('gemela: con una sola versión no hay «Comparar versiones»', async () => {
      await montar(modelo({ estado: 'firmada', borrador: null, versiones: [version(1)] }));
      expect(screen.queryByRole('button', { name: 'Comparar versiones' })).toBeNull();
    });

    it('la comparación cae con el candado: al caducar no queda ningún fragmento comparado', async () => {
      await montar(
        modelo({
          estado: 'modificada',
          borrador: null,
          versiones: [
            version(1, { texto: 'El paciente refiere ansiedad leve.' }),
            version(2, { texto: 'El paciente refiere ansiedad moderada y insomnio.' }),
          ],
        }),
        enMinutos(1),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Comparar versiones' }));
      expect(document.querySelector('ins')?.textContent).toContain('moderada');
      await avanzar(60_000);
      expect(screen.getByRole('heading', { name: 'Esta historia está cerrada' })).toBeInTheDocument();
      expect(document.querySelector('ins, del')).toBeNull();
      expect(screen.queryByText(/moderada/)).toBeNull();
      expect(screen.queryByText(/leve\./)).toBeNull();
    });

    it('quien no es el autor y la nota sigue en borrador: ve el borrador ajeno en solo lectura', async () => {
      await montar(modelo({ soyAutor: false, estado: 'borrador', versiones: [] }));
      expect(screen.getByText('Su autor tiene cambios sin firmar.')).toBeInTheDocument();
      expect(screen.getByText('Texto base')).toBeInTheDocument();
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    });
  });

  describe('foco al reemplazarse la vista (B0-H1, B0-H6)', () => {
    const titulo = () => screen.getByRole('heading', { name: 'Esta historia está cerrada' });

    it('el reloj caduca: el foco va al encabezado de «Esta historia está cerrada» y el aviso está en una región viva', async () => {
      await montar(modelo(), enMinutos(1));
      cuerpo().focus();
      await avanzar(60_000);
      expect(document.activeElement).toBe(titulo());
      expect(screen.getByRole('status')).toHaveTextContent(/La historia se ha cerrado sola/);
    });

    it('un guardado «bloqueada» lleva el foco al encabezado', async () => {
      guardarBorrador.mockResolvedValue({ ok: false, motivo: 'bloqueada' });
      await montar();
      escribir('Secreto');
      cuerpo().focus();
      await avanzar(3000);
      expect(document.activeElement).toBe(titulo());
    });

    it('firmar y recibir «bloqueada» lleva el foco al encabezado', async () => {
      firmarNota.mockResolvedValue({ ok: false, motivo: 'bloqueada' });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(document.activeElement).toBe(titulo());
    });

    it('la firma que sale bien pero no trae la nota lleva el foco al botón «Recargar»', async () => {
      firmarNota.mockResolvedValue({ ok: true, nota: null, caducaEn: null });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Recargar' }));
    });

    it('«Abrir el editor» con el candado cerrado lleva el foco al campo del PIN', async () => {
      abrirEditorDeNota.mockResolvedValue({ estado: 'bloqueada' });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      const abrirBoton = screen.getByRole('button', { name: 'Abrir el editor' });
      abrirBoton.focus();
      fireEvent.click(abrirBoton);
      await vaciar();
      expect(document.activeElement).toBe(screen.getByLabelText('PIN'));
    });
  });

  describe('foco tras un gesto que reemplaza la vista (B1-H2, B1-H3)', () => {
    /** El foco se pone antes en el disparador: `fireEvent.click` no lo mueve y se mediría `body` por azar. */
    async function disparar(boton: HTMLElement) {
      boton.focus();
      expect(document.activeElement).toBe(boton);
      fireEvent.click(boton);
      await vaciar();
      await vaciar();
    }
    const abrirBoton = () => screen.getByRole('button', { name: 'Abrir el editor' });

    it('B0-H1 · el encabezado del candado se describe con el aviso (aria-describedby)', async () => {
      await montar(modelo(), enMinutos(1));
      await avanzar(60_000);
      const titulo = screen.getByRole('heading', { name: 'Esta historia está cerrada' });
      expect(titulo).toHaveAccessibleDescription(/La historia se ha cerrado sola/);
    });

    it('«Abrir el editor» → abierta con borrador propio: el foco va al cuerpo de la nota', async () => {
      abrirEditorDeNota.mockResolvedValue({ estado: 'abierta', caducaEn: enMinutos(30), nota: modelo() });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      await disparar(abrirBoton());
      expect(document.activeElement).toBe(cuerpo());
      expect(cuerpo()).toHaveAccessibleName('Nota');
    });

    it('«Abrir el editor» → abierta solo lectura: el foco va al encabezado de la versión vigente', async () => {
      abrirEditorDeNota.mockResolvedValue({
        estado: 'abierta',
        caducaEn: enMinutos(30),
        nota: modelo({ soyAutor: false, estado: 'firmada', borrador: null, versiones: [version(1)] }),
      });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      await disparar(abrirBoton());
      const titulo = screen.getByRole('heading', { name: 'Versión vigente' });
      expect(document.activeElement).toBe(titulo);
    });

    it('B2-H2 · «Abrir el editor» → borrador oculto sin versiones: el foco va al grupo «Hay un borrador en curso.»', async () => {
      abrirEditorDeNota.mockResolvedValue({
        estado: 'abierta',
        caducaEn: enMinutos(30),
        nota: modelo({ soyAutor: false, borrador: null, borradorOculto: true, versiones: [] }),
      });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      await disparar(abrirBoton());
      expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Hay un borrador en curso.' }));
    });

    it('B2-H2 · «Abrir el editor» → borrador ajeno legible sin versiones: el foco va a su encabezado', async () => {
      abrirEditorDeNota.mockResolvedValue({
        estado: 'abierta',
        caducaEn: enMinutos(30),
        nota: modelo({ soyAutor: false, versiones: [] }),
      });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      await disparar(abrirBoton());
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Su autor tiene cambios sin firmar.' }));
    });

    it('B2-H2 · «Abrir el editor» → nada que leer: el foco va al grupo del estado vacío', async () => {
      abrirEditorDeNota.mockResolvedValue({
        estado: 'abierta',
        caducaEn: enMinutos(30),
        nota: modelo({ soyAutor: false, borrador: null, borradorOculto: false, versiones: [] }),
      });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      await disparar(abrirBoton());
      expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Esta nota no está disponible.' }));
    });

    it.each([
      [false, 'Versión vigente'],
      [true, 'Última versión conjunta'],
    ])('B2-H2 · gemela: borrador oculto CON versiones (lectura conjunta %s) → el encabezado «%s»', async (lecturaConjunta, nombre) => {
      abrirEditorDeNota.mockResolvedValue({
        estado: 'abierta',
        caducaEn: enMinutos(30),
        nota: modelo({
          soyAutor: false,
          estado: 'firmada_con_cambios',
          borrador: null,
          borradorOculto: true,
          lecturaConjunta,
          versiones: [version(1, { alcance: lecturaConjunta ? 'conjunta' : 'individual' })],
        }),
      });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      await disparar(abrirBoton());
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: nombre }));
    });

    it('«Abrir el editor» → error: el foco va a «Volver a intentarlo»', async () => {
      abrirEditorDeNota.mockResolvedValue({ estado: 'error' });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      await disparar(abrirBoton());
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Volver a intentarlo' }));
    });

    it('«Abrir el editor» → no_disponible: el foco va a un grupo con nombre, no a body', async () => {
      abrirEditorDeNota.mockResolvedValue({ estado: 'no_disponible' });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      await disparar(abrirBoton());
      expect(document.activeElement).toBe(
        screen.getByRole('group', { name: 'Esta nota no está disponible.' }),
      );
    });

    it('«Abrir el editor» → elegir_episodio: el foco va al desplegable de episodio', async () => {
      abrirEditorDeNota.mockResolvedValue({
        estado: 'elegir_episodio',
        episodios: [{ id: 'e1', etiqueta: 'Individual · 1 oct' }],
      });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      await disparar(abrirBoton());
      expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Episodio' }));
    });

    it('tras el PIN, un acceso denegado (sin_acceso) lleva el foco a su grupo con nombre', async () => {
      abrirEditorDeNota.mockResolvedValue({ estado: 'bloqueada' });
      render(<EditorDeNota pacienteId={PACIENTE} citaId={CITA} notaId={null} />);
      await disparar(abrirBoton());
      const { abrirHistoria } = await import('@/app/(app)/candado/acciones');
      vi.mocked(abrirHistoria).mockResolvedValue({ abierta: true } as never);
      fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '111111' } });
      screen.getByLabelText('PIN').focus();
      fireEvent.submit(screen.getByLabelText('PIN').closest('form')!);
      await vaciar();
      await vaciar();
      expect(document.activeElement).toBe(
        screen.getByRole('group', { name: 'No se puede abrir la historia de este paciente.' }),
      );
    });

    it('«Modificar» con éxito: el foco va al cuerpo de la nota nuevo', async () => {
      empezarModificacion.mockResolvedValue({
        ok: true,
        nota: modelo({ estado: 'firmada_con_cambios', versiones: [version(1)] }),
        caducaEn: null,
      });
      await montar(modelo({ estado: 'firmada', borrador: null, versiones: [version(1)] }));
      await disparar(screen.getByRole('button', { name: 'Modificar' }));
      expect(document.activeElement).toBe(cuerpo());
    });

    it('«Recargar» tras una firma sin recarga: el foco va al encabezado de la versión vigente', async () => {
      firmarNota.mockResolvedValue({ ok: true, nota: null, caducaEn: null });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      abrirEditorDeNota.mockResolvedValue({
        estado: 'abierta',
        caducaEn: enMinutos(30),
        nota: modelo({ estado: 'firmada', borrador: null, versiones: [version(1)] }),
      });
      await disparar(screen.getByRole('button', { name: 'Recargar' }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Versión vigente' }));
    });

    it('«Cargar lo guardado» tras un conflicto: el foco va al cuerpo de la nota recargado', async () => {
      firmarNota.mockResolvedValue({ ok: false, motivo: 'conflicto' });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      abrirEditorDeNota.mockResolvedValue({
        estado: 'abierta',
        caducaEn: enMinutos(30),
        nota: modelo({ borrador: { texto: 'Lo guardado', reservadas: '', testigo: 'T9' } }),
      });
      await disparar(screen.getByRole('button', { name: 'Cargar lo guardado' }));
      expect(cuerpo().value).toBe('Lo guardado');
      expect(document.activeElement).toBe(cuerpo());
    });

    it('un «Recargar» que falla (error) no roba el foco del botón que sigue montado', async () => {
      firmarNota.mockResolvedValue({ ok: false, motivo: 'conflicto' });
      await montar();
      const dialogo = await abrirDialogoDeFirma();
      await confirmar(dialogo);
      abrirEditorDeNota.mockResolvedValue({ estado: 'error' });
      const cargar = screen.getByRole('button', { name: 'Cargar lo guardado' });
      await disparar(cargar);
      expect(document.activeElement).toBe(cargar);
    });

    describe('B2-H1 · una recarga que falla en el camino del aviso', () => {
      async function firmarSinRecarga() {
        firmarNota.mockResolvedValue({ ok: true, nota: null, caducaEn: null });
        await montar();
        const dialogo = await abrirDialogoDeFirma();
        await confirmar(dialogo);
        return screen.getByRole('button', { name: 'Recargar' });
      }

      async function firmarYaFirmada() {
        firmarNota.mockResolvedValue({ ok: false, motivo: 'ya_firmada' });
        await montar();
        const dialogo = await abrirDialogoDeFirma();
        await confirmar(dialogo);
        return screen.getByRole('button', { name: 'Cargar lo guardado' });
      }

      it.each([
        ['firmada sin recargar → «Recargar»', firmarSinRecarga],
        ['ya firmada → «Cargar lo guardado»', firmarYaFirmada],
      ])('(a/b) %s → error: «No se pudo recargar la nota.», foco en «Volver a intentarlo», sigue de solo lectura', async (_n, preparar) => {
        const boton = await preparar();
        abrirEditorDeNota.mockResolvedValue({ estado: 'error' });
        await disparar(boton);
        expect(screen.getByText('No se pudo recargar la nota.')).toBeInTheDocument();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Volver a intentarlo' }));
        expect(cuerpo().readOnly).toBe(true);
      });

      it('(a2) el foco vuelve al aviso aunque se haya ido durante la recarga (no depende de que React conserve el botón)', async () => {
        const boton = await firmarSinRecarga();
        abrirEditorDeNota.mockResolvedValue({ estado: 'error' });
        boton.focus();
        fireEvent.click(boton);
        boton.blur();
        expect(document.activeElement).toBe(document.body);
        await vaciar();
        await vaciar();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Volver a intentarlo' }));
      });

      it('(c) «Volver a intentarlo» con apertura abierta recarga y lleva el foco a la vigente', async () => {
        const boton = await firmarSinRecarga();
        abrirEditorDeNota.mockResolvedValue({ estado: 'error' });
        await disparar(boton);
        abrirEditorDeNota.mockResolvedValue({
          estado: 'abierta',
          caducaEn: enMinutos(30),
          nota: modelo({ estado: 'firmada', borrador: null, versiones: [version(1)] }),
        });
        await disparar(screen.getByRole('button', { name: 'Volver a intentarlo' }));
        expect(screen.getByText('Texto firmado 1')).toBeInTheDocument();
        expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Versión vigente' }));
      });

      it('(d) la recarga da no_disponible: el foco va al grupo con el nombre del aviso, que no tiene botón', async () => {
        const boton = await firmarSinRecarga();
        abrirEditorDeNota.mockResolvedValue({ estado: 'no_disponible' });
        await disparar(boton);
        const grupo = screen.getByRole('group', { name: 'Esta nota no está disponible.' });
        expect(within(grupo).queryByRole('button')).toBeNull();
        expect(document.activeElement).toBe(grupo);
        expect(cuerpo().readOnly).toBe(true);
      });
    });

    describe('firma rechazada (B1-H3): el foco no cae en body', () => {
      async function firmarRechazada(motivo: string) {
        firmarNota.mockResolvedValue({ ok: false, motivo });
        await montar();
        const firmar = screen.getByRole('button', { name: 'Firmar' });
        firmar.focus();
        const dialogo = await abrirDialogoDeFirma();
        await confirmar(dialogo);
        expect(screen.queryByRole('dialog')).toBeNull();
      }

      it.each(['ya_firmada', 'sin_borrador'])('%s → «Cargar lo guardado»', async (motivo) => {
        await firmarRechazada(motivo);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cargar lo guardado' }));
      });

      it('no_autor → el cuerpo de la nota, ya de solo lectura', async () => {
        await firmarRechazada('no_autor');
        expect(document.activeElement).toBe(cuerpo());
        expect(cuerpo().readOnly).toBe(true);
      });

      it('no_disponible → «Firmar», que sigue montado y vuelve a estar activo', async () => {
        await firmarRechazada('no_disponible');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Firmar' }));
      });

      describe('el error se queda dentro del diálogo (ronda 3)', () => {
        /** Como un navegador: al deshabilitarse el botón con el foco, el foco cae a body. */
        async function firmarYRechazar(resultado: unknown) {
          let terminar: (v: unknown) => void = () => {};
          firmarNota.mockReturnValue(new Promise((r) => (terminar = r)));
          await montar();
          const dialogo = await abrirDialogoDeFirma();
          const confirma = within(dialogo).getByRole('button', { name: 'Firmar' });
          confirma.focus();
          fireEvent.click(confirma);
          await vaciar();
          expect(within(dialogo).getByRole('button', { name: 'Firmando…' })).toBeDisabled();
          // jsdom no suelta el foco de un botón deshabilitado: se imita lo que hace el navegador.
          const activo = document.activeElement as HTMLElement;
          activo.removeAttribute('disabled');
          activo.blur();
          activo.setAttribute('disabled', '');
          expect(document.activeElement).toBe(document.body);
          terminar(resultado);
          await vaciar();
          await vaciar();
          return screen.getByRole('dialog');
        }

        it.each([
          ['vacia', { ok: false, motivo: 'vacia' }, 'No se firma una nota vacía.'],
          ['noSeFirmo', { ok: false, motivo: 'error' }, 'No se pudo firmar. Vuelve a intentarlo.'],
        ])('%s → el foco vuelve a «Firmar» del diálogo y el error lo describe', async (_n, resultado, texto) => {
          const dialogo = await firmarYRechazar(resultado);
          const confirma = within(dialogo).getByRole('button', { name: 'Firmar' });
          expect(confirma).toBeEnabled();
          expect(document.activeElement).toBe(confirma);
          const alerta = within(dialogo).getByRole('alert');
          expect(alerta).toHaveTextContent(texto);
          expect(alerta.id).not.toBe('');
          expect(confirma.getAttribute('aria-describedby')).toBe(alerta.id);
        });

        it('B3-H1 · un repintado sin cambios no mueve el foco: tras el error, «Cancelar» lo conserva al pasar el reloj', async () => {
          const dialogo = await firmarYRechazar({ ok: false, motivo: 'error' });
          const cancelar = within(dialogo).getByRole('button', { name: 'Cancelar' });
          cancelar.focus();
          expect(document.activeElement).toBe(cancelar);
          // El reloj de los minutos repinta el editor cada 30 s.
          await avanzar(30_000);
          await avanzar(30_000);
          expect(screen.getByRole('dialog')).toBe(dialogo);
          expect(document.activeElement).toBe(cancelar);
        });

        it('B3-H2 · al abrir la firma de una modificación, el foco inicial va al motivo, no a «Firmar»', async () => {
          await montar(modelo({ estado: 'firmada_con_cambios', versiones: [version(1)] }));
          const dialogo = await abrirDialogoDeFirma();
          expect(document.activeElement).toBe(within(dialogo).getByRole('textbox', { name: 'Motivo del cambio' }));
        });

        it('B3-H2 · gemela: sin versiones, el foco inicial va a «Firmar»', async () => {
          await montar();
          const dialogo = await abrirDialogoDeFirma();
          expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Firmar' }));
        });

        it('sin error, «Firmar» no lleva aria-describedby', async () => {
          await montar();
          const dialogo = await abrirDialogoDeFirma();
          expect(within(dialogo).getByRole('button', { name: 'Firmar' }).hasAttribute('aria-describedby')).toBe(false);
        });
      });

      it('cancelar sigue devolviendo el foco a «Firmar» (no se rompe lo que ya iba)', async () => {
        await montar();
        const firmar = screen.getByRole('button', { name: 'Firmar' });
        firmar.focus();
        const dialogo = await abrirDialogoDeFirma();
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
        await vaciar();
        expect(document.activeElement).toBe(firmar);
      });
    });
  });

  describe('coprofesional', () => {
    const candidatos = [
      { id: '66666666-6666-4666-8666-666666666666', nombre: 'Luis Gómez' },
    ];

    it('solo el autor sin versiones lo ve; elegir llama a fijarCoprofesional y «Sin coprofesional» manda null', async () => {
      fijarCoprofesional.mockResolvedValue({
        ok: true,
        nota: modelo({
          candidatosCoprofesional: candidatos,
          cabecera: {
            fechaSesion: '1 de octubre',
            horario: null,
            episodio: 'Individual',
            coprofesional: candidatos[0]!,
          },
        }),
        caducaEn: null,
      });
      await montar(modelo({ candidatosCoprofesional: candidatos }));
      fireEvent.click(screen.getByRole('combobox', { name: 'Coprofesional' }));
      fireEvent.click(screen.getByRole('option', { name: 'Luis Gómez' }));
      await vaciar();
      expect(fijarCoprofesional).toHaveBeenCalledWith({
        pacienteId: PACIENTE,
        notaId: NOTA,
        coprofesionalId: candidatos[0]!.id,
      });

      fijarCoprofesional.mockResolvedValue({ ok: true, nota: modelo({ candidatosCoprofesional: candidatos }), caducaEn: null });
      fireEvent.click(screen.getByRole('combobox', { name: 'Coprofesional' }));
      fireEvent.click(screen.getByRole('option', { name: 'Sin coprofesional' }));
      await vaciar();
      expect(fijarCoprofesional).toHaveBeenLastCalledWith({ pacienteId: PACIENTE, notaId: NOTA, coprofesionalId: null });
    });

    it('B0-H5 · elegir coprofesional con caducaEn null (solo_modelo) NO borra el plazo: al llegar T se cierra sola', async () => {
      fijarCoprofesional.mockResolvedValue({
        ok: true,
        nota: modelo({ candidatosCoprofesional: candidatos }),
        caducaEn: null,
      });
      await montar(modelo({ candidatosCoprofesional: candidatos }), enMinutos(5));
      fireEvent.click(screen.getByRole('combobox', { name: 'Coprofesional' }));
      fireEvent.click(screen.getByRole('option', { name: 'Luis Gómez' }));
      await vaciar();
      expect(fijarCoprofesional).toHaveBeenCalledTimes(1);
      await avanzar(5 * 60_000);
      expect(screen.getByText(/La historia se ha cerrado sola/)).toBeInTheDocument();
    });

    it('con versiones, o sin ser autor, no hay desplegable', async () => {
      await montar(
        modelo({ candidatosCoprofesional: candidatos, estado: 'firmada_con_cambios', versiones: [version(1)] }),
      );
      expect(screen.queryByRole('combobox', { name: 'Coprofesional' })).toBeNull();
    });

    it('coprofesional_invalido y ya_firmada dicen su frase', async () => {
      fijarCoprofesional.mockResolvedValueOnce({ ok: false, motivo: 'coprofesional_invalido' });
      await montar(modelo({ candidatosCoprofesional: candidatos }));
      fireEvent.click(screen.getByRole('combobox', { name: 'Coprofesional' }));
      fireEvent.click(screen.getByRole('option', { name: 'Luis Gómez' }));
      await vaciar();
      expect(screen.getByText('Esa persona no puede figurar como coprofesional en este centro.')).toBeInTheDocument();

      fijarCoprofesional.mockResolvedValueOnce({ ok: false, motivo: 'ya_firmada' });
      fireEvent.click(screen.getByRole('combobox', { name: 'Coprofesional' }));
      fireEvent.click(screen.getByRole('option', { name: 'Luis Gómez' }));
      await vaciar();
      expect(screen.getByText('Ya está firmada: el coprofesional no se cambia.')).toBeInTheDocument();
    });

    it('ok con nota null: «Hecho. No se pudo recargar la nota.»', async () => {
      fijarCoprofesional.mockResolvedValue({ ok: true, nota: null, caducaEn: null });
      await montar(modelo({ candidatosCoprofesional: candidatos }));
      fireEvent.click(screen.getByRole('combobox', { name: 'Coprofesional' }));
      fireEvent.click(screen.getByRole('option', { name: 'Luis Gómez' }));
      await vaciar();
      expect(screen.getByText('Hecho. No se pudo recargar la nota.')).toBeInTheDocument();
    });
  });
});
