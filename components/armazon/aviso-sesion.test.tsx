import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SesionPropia } from '@/lib/agenda/avisos';

const m = vi.hoisted(() => ({ disponible: true, descartarFranja: vi.fn() }));

vi.mock('@/app/(app)/agenda/notas', () => ({
  get RUTA_NOTAS_DISPONIBLE() {
    return m.disponible;
  },
  rutaNotas: (pacienteId: string, citaId: string) => `/pacientes/${pacienteId}/historia/notas?cita=${citaId}`,
}));
vi.mock('./acciones-avisos', () => ({ descartarFranja: (id: string) => m.descartarFranja(id) }));

const { AnclaSesion, FranjaSesion, ProveedorAvisosSesion } = await import('./aviso-sesion');

const CITA = '11111111-1111-4111-8111-111111111111';
const PACIENTE = '22222222-2222-4222-8222-222222222222';

const SESION: SesionPropia = {
  citaId: CITA,
  pacienteId: PACIENTE,
  nombrePaciente: 'Ana Prueba',
  inicio: '2026-10-01T10:00:00.000Z',
  fin: '2026-10-01T10:50:00.000Z',
  desde: '12:00',
  hasta: '12:50',
  estado: 'programada',
};

// «Ningún new Date() sin argumentos»: se envuelve el constructor y se cuentan las llamadas
// sin argumentos (y `Date()` como función), mientras dura cada prueba.
const DateReal = globalThis.Date;
let sinArgumentos = 0;

beforeEach(() => {
  sinArgumentos = 0;
  globalThis.Date = new Proxy(DateReal, {
    construct(objetivo, args, nuevo) {
      if (args.length === 0) sinArgumentos++;
      return Reflect.construct(objetivo, args, nuevo);
    },
    apply(objetivo, esto, args) {
      sinArgumentos++;
      return Reflect.apply(objetivo, esto, args);
    },
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  m.disponible = true;
  m.descartarFranja.mockReset();
  m.descartarFranja.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.Date = DateReal;
  expect(sinArgumentos).toBe(0);
});

function pintar(ahoraServidor: string, descartadas: string[] = []) {
  return render(
    <ProveedorAvisosSesion>
      <AnclaSesion ahoraServidor={ahoraServidor} sesiones={[SESION]} />
      <input aria-label="Campo de prueba" />
      <FranjaSesion ahoraServidor={ahoraServidor} sesiones={[SESION]} descartadas={descartadas} />
    </ProveedorAvisosSesion>,
  );
}

const TEXTO_FRANJA = 'Sesión en curso · Ana Prueba · 12:00–12:50';

describe('FranjaSesion', () => {
  it('el live region existe vacío antes de que haya franja', () => {
    pintar('2026-10-01T09:59:00.000Z');
    const estado = screen.getByRole('status');
    expect(estado.textContent).toBe('');
    expect(estado.getAttribute('aria-live')).toBe('polite');
    expect(estado.getAttribute('aria-atomic')).toBe('true');
  });

  it('aparece al llegar el inicio sin robar el foco del campo enfocado', () => {
    pintar('2026-10-01T09:59:00.000Z');
    const campo = screen.getByLabelText('Campo de prueba');
    campo.focus();
    expect(screen.queryByText(TEXTO_FRANJA)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(60_100);
    });

    expect(screen.getByRole('status').textContent).toContain(TEXTO_FRANJA);
    expect(document.activeElement).toBe(campo);
  });

  it('vive dentro de role="status" y no hay ningún role="alert"', () => {
    const { container } = pintar('2026-10-01T10:10:00.000Z');
    expect(screen.getByRole('status').textContent).toContain(TEXTO_FRANJA);
    expect(container.querySelector('[role="alert"], [role="alertdialog"], dialog')).toBeNull();
  });

  it('se va al llegar el fin (fin excluido)', () => {
    pintar('2026-10-01T10:49:30.000Z');
    expect(screen.getByRole('status').textContent).toContain(TEXTO_FRANJA);
    act(() => {
      vi.advanceTimersByTime(30_100);
    });
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('link', { name: /En sesión/ })).toBeNull();
  });

  it('«Notas» enlaza a la nota de la sesión', () => {
    pintar('2026-10-01T10:10:00.000Z');
    expect(screen.getByRole('link', { name: 'Notas' }).getAttribute('href')).toBe(
      `/pacientes/${PACIENTE}/historia/notas?cita=${CITA}`,
    );
  });

  it('gemela: «Notas» no se pinta si la ruta de notas no está disponible', () => {
    m.disponible = false;
    pintar('2026-10-01T10:10:00.000Z');
    expect(screen.getByRole('status').textContent).toContain(TEXTO_FRANJA);
    expect(screen.queryByRole('link', { name: 'Notas' })).toBeNull();
  });

  it('tras descartar: no vuelve con el tiempo, el ancla sigue y el foco queda en el ancla', () => {
    pintar('2026-10-01T10:10:00.000Z');
    fireEvent.click(screen.getByRole('button', { name: 'Descartar aviso' }));

    expect(m.descartarFranja).toHaveBeenCalledWith(CITA);
    expect(screen.getByRole('status').textContent).toBe('');
    const ancla = screen.getByRole('link', { name: /En sesión/ });
    expect(document.activeElement).toBe(ancla);

    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('link', { name: /En sesión/ })).toBeTruthy();
  });

  it.each([
    ['rechaza', () => m.descartarFranja.mockRejectedValue(new Error('red'))],
    ['da ok:false', () => m.descartarFranja.mockResolvedValue({ ok: false })],
  ])(
    'si descartar %s: nada se lanza, la franja sigue oculta, sin anuncio y el foco en el ancla',
    async (_nombre, preparar) => {
      preparar();
      const errores: unknown[] = [];
      const alError = (e: Event) => {
        errores.push(e);
      };
      window.addEventListener('unhandledrejection', alError);
      window.addEventListener('error', alError);
      const consola = vi.spyOn(console, 'error').mockImplementation(() => {});

      pintar('2026-10-01T10:10:00.000Z');
      fireEvent.click(screen.getByRole('button', { name: 'Descartar aviso' }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(m.descartarFranja).toHaveBeenCalledWith(CITA);
      expect(screen.getByRole('status').textContent).toBe('');
      expect(document.activeElement).toBe(screen.getByRole('link', { name: /En sesión/ }));
      // Ni reversión ni anuncio: descartar es una preferencia de presentación (R3).
      act(() => {
        vi.advanceTimersByTime(120_000);
      });
      expect(screen.getByRole('status').textContent).toBe('');
      expect(errores).toEqual([]);

      window.removeEventListener('unhandledrejection', alError);
      window.removeEventListener('error', alError);
      consola.mockRestore();
    },
  );

  it('una franja descartada en la cookie no se pinta, pero el ancla sí', () => {
    pintar('2026-10-01T10:10:00.000Z', [CITA]);
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('link', { name: /En sesión/ })).toBeTruthy();
  });
});

describe('AnclaSesion', () => {
  it('no se pinta sin sesión en curso', () => {
    pintar('2026-10-01T09:00:00.000Z');
    expect(screen.queryByRole('link', { name: /En sesión/ })).toBeNull();
  });

  it('enlaza a la nota de la sesión, o a la agenda si la ruta no está disponible', () => {
    const { unmount } = pintar('2026-10-01T10:10:00.000Z');
    expect(screen.getByRole('link', { name: /En sesión/ }).getAttribute('href')).toBe(
      `/pacientes/${PACIENTE}/historia/notas?cita=${CITA}`,
    );
    unmount();
    m.disponible = false;
    pintar('2026-10-01T10:10:00.000Z');
    expect(screen.getByRole('link', { name: /En sesión/ }).getAttribute('href')).toBe('/agenda');
  });
});
