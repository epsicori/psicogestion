import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatosAvisos, SesionPropia } from '@/lib/agenda/avisos';

/**
 * El refresco de los avisos (T-015, R2). Lo que se vigila: se refresca con actividad del
 * usuario (cambio de ruta, vuelta a la pestaña) y **nunca con un temporizador de red**, porque
 * la sesión caduca a los 30 minutos de inactividad y un sondeo la mantendría viva.
 */

const m = vi.hoisted(() => ({ ruta: '/agenda' }));

vi.mock('next/navigation', () => ({ usePathname: () => m.ruta }));
vi.mock('@/app/(app)/agenda/notas', () => ({
  RUTA_NOTAS_DISPONIBLE: true,
  rutaNotas: (pacienteId: string, citaId: string) => `/pacientes/${pacienteId}/historia/notas?cita=${citaId}`,
}));
vi.mock('./acciones-avisos', () => ({
  descartarFranja: vi.fn(async () => ({ ok: true })),
  marcarNotificacionLeida: vi.fn(async () => ({ ok: true })),
  marcarTodasLeidas: vi.fn(async () => ({ ok: true })),
}));

const {
  AnclaSesionViva,
  AvisoNotasVivo,
  CampanaViva,
  FranjaSesionViva,
  ProveedorAvisosVivos,
  RefrescoPorNavegacion,
  REFRESCO_MINIMO_MS,
} = await import('./avisos-vivos');

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

const TEXTO_FRANJA = 'Sesión en curso · Ana Prueba · 12:00–12:50';

function foto(parcial: Partial<DatosAvisos> = {}): DatosAvisos {
  return {
    ahoraServidor: '2026-10-01T09:30:00.000Z',
    sesiones: [],
    recuento: { nivel1: 0, nivel2: 0, nivel3: 0 },
    notificaciones: [],
    descartadas: [],
    ...parcial,
  };
}

/** Una respuesta como la que daría `fetch`, sin depender de `Response` (jsdom no lo trae). */
function respuesta({
  status = 200,
  type = 'basic',
  contentType = 'application/json; charset=utf-8',
  cuerpo = foto(),
}: { status?: number; type?: string; contentType?: string | null; cuerpo?: unknown } = {}) {
  return {
    status,
    type,
    headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => cuerpo,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  m.ruta = '/agenda';
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(respuesta());
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Arbol({ inicial }: { inicial: DatosAvisos }) {
  return (
    <ProveedorAvisosVivos>
      <RefrescoPorNavegacion />
      <AnclaSesionViva inicial={inicial} />
      <AvisoNotasVivo inicial={inicial} />
      <CampanaViva inicial={inicial} />
      <FranjaSesionViva inicial={inicial} />
    </ProveedorAvisosVivos>
  );
}

async function navegarA(ruta: string, vista: ReturnType<typeof render>, inicial: DatosAvisos) {
  m.ruta = ruta;
  await act(async () => {
    vista.rerender(<Arbol inicial={inicial} />);
  });
}

async function avanzar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('el refresco', () => {
  it('al montar no hace ninguna petición', async () => {
    render(<Arbol inicial={foto()} />);
    await avanzar(1_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un cambio de ruta hace una petición, bien formada', async () => {
    const inicial = foto();
    const vista = render(<Arbol inicial={inicial} />);
    await navegarA('/pacientes', vista, inicial);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/avisos');
    expect(init.cache).toBe('no-store');
    expect(init.redirect).toBe('manual');
    expect(init.headers.accept).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('otro cambio de ruta a los 10 s no hace ninguna; pasado el mínimo, sí', async () => {
    const inicial = foto();
    const vista = render(<Arbol inicial={inicial} />);
    await navegarA('/pacientes', vista, inicial);
    await avanzar(10_000);
    await navegarA('/agenda', vista, inicial);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await avanzar(REFRESCO_MINIMO_MS);
    await navegarA('/pacientes', vista, inicial);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mientras hay una petición en curso no lanza otra', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const inicial = foto();
    const vista = render(<Arbol inicial={inicial} />);
    await navegarA('/pacientes', vista, inicial);
    await avanzar(REFRESCO_MINIMO_MS * 2);
    await navegarA('/agenda', vista, inicial);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('volver a la pestaña a los 31 s hace una petición; ocultarla, ninguna', async () => {
    render(<Arbol inicial={foto()} />);
    await avanzar(31_000);

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetchMock).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('los vaivenes de la pestaña dentro del mínimo no repiten la petición', async () => {
    render(<Arbol inicial={foto()} />);
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await avanzar(5_000);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pasan dos horas sin tocar nada: cero peticiones (ningún temporizador de red)', async () => {
    render(<Arbol inicial={foto({ sesiones: [SESION] })} />);
    await avanzar(2 * 60 * 60 * 1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('al desmontar aborta la petición en curso', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const inicial = foto();
    const vista = render(<Arbol inicial={inicial} />);
    await navegarA('/pacientes', vista, inicial);
    const senal: AbortSignal = fetchMock.mock.calls[0][1].signal;
    expect(senal.aborted).toBe(false);
    vista.unmount();
    expect(senal.aborted).toBe(true);
  });
});

describe('lo que hace con la respuesta', () => {
  const enCurso = foto({ ahoraServidor: '2026-10-01T10:10:00.000Z', sesiones: [SESION] });

  async function refrescarCon(res: unknown, inicial = foto()) {
    fetchMock.mockResolvedValue(res);
    const vista = render(<Arbol inicial={inicial} />);
    await navegarA('/pacientes', vista, inicial);
    return vista;
  }

  it('una foto posterior con una sesión que abarca ese instante pinta la franja', async () => {
    await refrescarCon(respuesta({ cuerpo: enCurso }));
    expect(screen.getByRole('status').textContent).toContain(TEXTO_FRANJA);
    expect(screen.getByRole('link', { name: /En sesión/ })).toBeTruthy();
  });

  it('una foto anterior a la que ya hay se ignora', async () => {
    const inicial = foto({ ahoraServidor: '2026-10-01T10:30:00.000Z' });
    await refrescarCon(respuesta({ cuerpo: enCurso }), inicial);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('el recuento fresco se pinta en el aviso de notas', async () => {
    await refrescarCon(
      respuesta({ cuerpo: foto({ ahoraServidor: '2026-10-01T10:10:00.000Z', recuento: { nivel1: 0, nivel2: 2, nivel3: 1 } }) }),
    );
    expect(screen.getByRole('link', { name: '3 notas sin firmar desde hace más de un día' })).toBeTruthy();
  });

  it('las franjas descartadas que trae el refresco no se pintan', async () => {
    await refrescarCon(respuesta({ cuerpo: { ...enCurso, descartadas: [CITA] } }));
    expect(screen.getByRole('status').textContent).toBe('');
    // El ancla sigue: descartar solo quita la franja.
    expect(screen.getByRole('link', { name: /En sesión/ })).toBeTruthy();
  });

  it('si la petición rechaza, no se rompe nada y se conserva la franja anterior', async () => {
    const inicial = foto({ ahoraServidor: '2026-10-01T10:10:00.000Z', sesiones: [SESION] });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const vista = render(<Arbol inicial={inicial} />);
    await navegarA('/pacientes', vista, inicial);
    expect(screen.getByRole('status').textContent).toContain(TEXTO_FRANJA);
  });

  it.each([
    ['401', respuesta({ status: 401, cuerpo: enCurso })],
    ['503', respuesta({ status: 503, cuerpo: enCurso })],
    ['una redirección del proxy (opaqueredirect)', respuesta({ status: 0, type: 'opaqueredirect', cuerpo: enCurso })],
    ['HTML con 200', respuesta({ contentType: 'text/html; charset=utf-8', cuerpo: enCurso })],
    ['un 200 sin content-type', respuesta({ contentType: null, cuerpo: enCurso })],
    ['un cuerpo sin sesiones', respuesta({ cuerpo: { ...enCurso, sesiones: undefined } })],
    ['un cuerpo con un estado de cita desconocido', respuesta({ cuerpo: { ...enCurso, sesiones: [{ ...SESION, estado: 'x' }] } })],
    ['un cuerpo que no es un objeto', respuesta({ cuerpo: '<html></html>' })],
  ])('se ignora en silencio: %s', async (_nombre, res) => {
    await refrescarCon(res);
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('link', { name: /En sesión/ })).toBeNull();
  });

  it('un cuerpo que no es JSON (json() rechaza) se ignora', async () => {
    const res = respuesta();
    res.json = async () => {
      throw new SyntaxError('Unexpected token <');
    };
    await refrescarCon(res);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('el reloj se resincroniza: la franja aparece sin avanzar los temporizadores', async () => {
    // Inicial: 9:30, sesión de 10:00 a 10:50: no hay franja. Llega una foto de las 10:10.
    const inicial = foto({ sesiones: [SESION] });
    fetchMock.mockResolvedValue(respuesta({ cuerpo: enCurso }));
    const vista = render(<Arbol inicial={inicial} />);
    expect(screen.getByRole('status').textContent).toBe('');
    await navegarA('/pacientes', vista, inicial);
    expect(screen.getByRole('status').textContent).toContain(TEXTO_FRANJA);
  });
});
