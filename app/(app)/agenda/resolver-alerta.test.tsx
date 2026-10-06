import { act, fireEvent, render, screen } from '@testing-library/react';
import { Activity, StrictMode, useContext, useEffect, type ContextType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ resolverAlerta: vi.fn(), rethrow: vi.fn() }));

vi.mock('next/navigation', () => ({ unstable_rethrow: (e: unknown) => m.rethrow(e) }));

vi.mock('./acciones-alertas', () => ({ resolverAlerta: m.resolverAlerta }));

import { idEnlacePaciente } from './pendientes-ids';
import {
  ContextoMemoria,
  decidirDestino,
  MemoriaResolucion,
  ProveedorResolucion,
  ResolverAlerta,
  type Pendiente,
} from './resolver-alerta';

const ALERTA = '11111111-1111-4111-8111-111111111111';
const NOMBRE_BOTON = 'Marcar como resuelta: Consentimiento por firmar';

type Paciente = { id: string; alertas: string[]; anuncio?: string };

const ANA: Paciente = { id: 'pA', alertas: [ALERTA], anuncio: 'Ana, 1 pendiente' };

function etiquetaDe(alertaId: string): string {
  return alertaId === ALERTA ? 'Consentimiento por firmar' : `Informe ${alertaId}`;
}

function Bloque({
  conFila,
  pacientes,
  alAcertar,
}: {
  conFila?: boolean;
  pacientes?: Paciente[];
  alAcertar?: () => void;
}) {
  const lista = pacientes ?? (conFila ? [ANA] : []);
  return (
    <section aria-labelledby="agenda-documentacion">
      <h2 id="agenda-documentacion" tabIndex={-1}>
        Documentación pendiente
      </h2>
      <ProveedorResolucion
        prefijo="panel"
        encabezadoId="agenda-documentacion"
        pacientes={lista.map((p) => ({ id: p.id, alertas: p.alertas, anuncio: p.anuncio ?? `${p.id}, anuncio` }))}
        alAcertar={alAcertar}
      >
        {lista.length > 0 && (
          <ul>
            {lista.map((p) => (
              <li key={p.id}>
                <a id={idEnlacePaciente('panel', p.id)} href={`/pacientes/${p.id}`}>
                  {p.id}
                </a>
                {p.alertas.map((a) => (
                  <ResolverAlerta key={a} alertaId={a} pacienteId={p.id} etiquetaTipo={etiquetaDe(a)} />
                ))}
              </li>
            ))}
          </ul>
        )}
      </ProveedorResolucion>
    </section>
  );
}

function estadoFila(): HTMLElement {
  return screen.getByRole('button', { name: NOMBRE_BOTON }).closest('form')!.querySelector('[role="status"]')!;
}

function estadoBloque(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-estado-bloque]')!;
}

async function pulsar() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: NOMBRE_BOTON }));
  });
}

function diferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

describe('ResolverAlerta: fallos (T-015, R3)', () => {
  beforeEach(() => {
    m.resolverAlerta.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it.each([
    ['la acción rechaza', () => m.resolverAlerta.mockRejectedValue(new Error('red'))],
    ['la acción da ok:false', () => m.resolverAlerta.mockResolvedValue({ ok: false, error: 'fallo' })],
  ])('si %s: no se lanza nada, el botón sigue y se anuncia el error', async (_nombre, preparar) => {
    preparar();
    render(<Bloque conFila />);
    await pulsar();

    expect(estadoFila().textContent).toBe('No se ha podido marcar como resuelta.');
    expect(screen.getByRole('button', { name: NOMBRE_BOTON })).toBeTruthy();
    // Un fallo no es un éxito: nada en el status del bloque.
    expect(estadoBloque().textContent).toBe('');
  });

  it('un segundo fallo idéntico cambia el nodo del texto, para que se vuelva a anunciar', async () => {
    m.resolverAlerta.mockRejectedValue(new Error('red'));
    render(<Bloque conFila />);
    await pulsar();
    const primero = estadoFila().firstElementChild;
    expect(primero?.textContent).toBe('No se ha podido marcar como resuelta.');

    await pulsar();
    const segundo = estadoFila().firstElementChild;
    expect(segundo?.textContent).toBe('No se ha podido marcar como resuelta.');
    expect(segundo).not.toBe(primero);
  });

  it('el status de la fila existe vacío antes de fallar y no es un alert', () => {
    render(<Bloque conFila />);
    expect(estadoFila().textContent).toBe('');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('ResolverAlerta: mientras se envía (T-015, R4)', () => {
  beforeEach(() => m.resolverAlerta.mockReset());

  it('aria-disabled y no disabled: conserva el foco y un segundo clic no envía otra vez', async () => {
    const d = diferido<{ ok: true }>();
    m.resolverAlerta.mockReturnValue(d.promesa);
    render(<Bloque conFila />);

    const boton = screen.getByRole('button', { name: NOMBRE_BOTON });
    boton.focus();
    await pulsar();

    const pendiente = screen.getByRole('button', { name: 'Guardando…' });
    expect(pendiente.getAttribute('aria-disabled')).toBe('true');
    expect(pendiente.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(pendiente);

    await act(async () => {
      fireEvent.click(pendiente);
    });
    expect(m.resolverAlerta).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolver({ ok: true });
    });
  });

  it('gemela: sin envío pendiente el botón no lleva aria-disabled', () => {
    render(<Bloque conFila />);
    expect(screen.getByRole('button', { name: NOMBRE_BOTON }).getAttribute('aria-disabled')).not.toBe('true');
  });
});

describe('ResolverAlerta: éxito y foco (T-015 R4, T-048 criterio 9)', () => {
  beforeEach(() => m.resolverAlerta.mockReset());

  const OTRA = '22222222-2222-4222-8222-222222222222';
  const B: Paciente = { id: 'pB', alertas: [OTRA], anuncio: 'Berta, 1 pendiente' };
  const C: Paciente = { id: 'pC', alertas: ['c1'], anuncio: 'Carla, 1 pendiente' };
  const A_CON_DOS: Paciente = { id: 'pA', alertas: [ALERTA, 'a2'], anuncio: 'Ana, 1 pendiente' };
  const A_CON_UNA: Paciente = { id: 'pA', alertas: ['a2'], anuncio: 'Ana, 1 pendiente' };

  it('(a) el paciente sigue: el foco va a su enlace y se anuncia lo resuelto y su estado', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    const { rerender } = render(<Bloque pacientes={[A_CON_DOS, B]} />);
    const boton = screen.getAllByRole('button', { name: NOMBRE_BOTON })[0];
    boton.focus();
    await pulsar();

    // Antes de que la revalidación llegue, nada se mueve: la alerta sigue en lo pintado.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: NOMBRE_BOTON }));
    expect(estadoBloque().textContent).toBe('');

    rerender(<Bloque pacientes={[A_CON_UNA, B]} />);
    expect(document.activeElement).toBe(document.getElementById('panel-paciente-pA'));
    expect(estadoBloque().textContent).toBe('Marcada como resuelta. Ana, 1 pendiente');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('(b) el paciente desaparece y no era el último: el foco va al que ocupa su sitio', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    const { rerender } = render(<Bloque pacientes={[ANA, B, C]} />);
    // Se resuelve la del paciente de en medio.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Marcar como resuelta: Informe ' + OTRA }));
    });
    expect(document.activeElement).toBe(document.body);

    rerender(<Bloque pacientes={[ANA, C]} />);
    expect(document.activeElement).toBe(document.getElementById('panel-paciente-pC'));
    expect(estadoBloque().textContent).toBe('Marcada como resuelta.');
  });

  it('(b) el primero desaparece: el foco va al nuevo primero', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    const { rerender } = render(<Bloque pacientes={[ANA, B, C]} />);
    await pulsar();
    rerender(<Bloque pacientes={[B, C]} />);
    expect(document.activeElement).toBe(document.getElementById('panel-paciente-pB'));
  });

  it('(b) era el último: el foco va al anterior', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    const { rerender } = render(<Bloque pacientes={[ANA, B, C]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Marcar como resuelta: Informe c1' }));
    });
    rerender(<Bloque pacientes={[ANA, B]} />);
    expect(document.activeElement).toBe(document.getElementById('panel-paciente-pB'));
  });

  it('regla eraUltimo con un rerender (la redirección real está en documentacion/remontaje.test.tsx): la lista nueva es más larga y el foco va al último, no al de su índice', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    const D: Paciente = { id: 'pD', alertas: ['d1'], anuncio: 'Dora, 1 pendiente' };
    const E: Paciente = { id: 'pE', alertas: ['e1'], anuncio: 'Eva, 1 pendiente' };
    const { rerender } = render(<Bloque pacientes={[ANA]} />);
    await pulsar();
    // Resolver el único paciente de la última página: la redirección lleva a la anterior, que
    // trae más pacientes. `min(indice, len - 1)` daría el primero (índice 0); aquí era el último.
    rerender(<Bloque pacientes={[B, C, D, E]} />);
    expect(document.activeElement).toBe(document.getElementById('panel-paciente-pE'));
  });

  it('gemela de la regla eraUltimo (con un rerender, no con la redirección): la lista nueva es más larga y el foco va al de su índice', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    const D: Paciente = { id: 'pD', alertas: ['d1'], anuncio: 'Dora, 1 pendiente' };
    const E: Paciente = { id: 'pE', alertas: ['e1'], anuncio: 'Eva, 1 pendiente' };
    const { rerender } = render(<Bloque pacientes={[ANA, B]} />);
    await pulsar();
    rerender(<Bloque pacientes={[C, D, E]} />);
    expect(document.activeElement).toBe(document.getElementById('panel-paciente-pC'));
  });

  it('(c) la lista queda vacía: el foco va al encabezado y el status sigue montado', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    const { rerender } = render(<Bloque conFila />);
    expect(estadoBloque()).toBeTruthy();
    screen.getByRole('button', { name: NOMBRE_BOTON }).focus();
    await pulsar();

    rerender(<Bloque conFila={false} />);
    expect(document.activeElement).toBe(document.getElementById('agenda-documentacion'));
    expect(estadoBloque().textContent).toBe('Marcada como resuelta.');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('el proveedor no es un grupo ni un tabstop: la lista no se anuncia como región', () => {
    render(<Bloque conFila />);
    expect(screen.queryByRole('group')).toBeNull();
    expect(document.querySelector('[data-bloque-pendientes]')?.hasAttribute('tabindex')).toBe(false);
  });

  it('al acertar avisa a alAcertar; al fallar, no', async () => {
    const alAcertar = vi.fn();
    m.resolverAlerta.mockResolvedValueOnce({ ok: false, error: 'fallo' });
    render(<Bloque conFila alAcertar={alAcertar} />);
    await pulsar();
    expect(alAcertar).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(document.getElementById('agenda-documentacion'));

    m.resolverAlerta.mockResolvedValueOnce({ ok: true });
    await pulsar();
    expect(alAcertar).toHaveBeenCalledTimes(1);
  });

  it('gemela: si la acción falla, el foco no se roba y el status del bloque queda vacío', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: false, error: 'fallo' });
    render(<Bloque conFila />);
    const boton = screen.getByRole('button', { name: NOMBRE_BOTON });
    boton.focus();
    await pulsar();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: NOMBRE_BOTON }));
    expect(estadoBloque().textContent).toBe('');
  });
});

describe('ResolverAlerta: redirección de la sesión caducada (T-015, R3)', () => {
  beforeEach(() => {
    m.resolverAlerta.mockReset();
    m.rethrow.mockClear();
  });

  it('el catch pasa el error por unstable_rethrow antes de tragarlo (un redirect sigue su camino)', async () => {
    const error = new Error('NEXT_REDIRECT');
    m.resolverAlerta.mockRejectedValue(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Bloque conFila />);
    await pulsar();

    // Lo que hace `unstable_rethrow` con un redirect real es de Next; aquí se fija que se llama
    // con el error de la acción, en el primer lugar del catch.
    expect(m.rethrow).toHaveBeenCalledWith(error);
  });
});

describe('ResolverAlerta: el segundo clic mientras envía (T-015, R4)', () => {
  beforeEach(() => m.resolverAlerta.mockReset());

  it('con el envío pendiente, el clic llega con defaultPrevented y no se envía otra vez', async () => {
    const d = diferido<{ ok: true }>();
    m.resolverAlerta.mockReturnValue(d.promesa);
    render(<Bloque conFila />);
    await pulsar();

    const pendiente = screen.getByRole('button', { name: 'Guardando…' });
    let prevenido = false;
    await act(async () => {
      prevenido = !fireEvent.click(pendiente);
    });
    expect(prevenido).toBe(true);
    expect(m.resolverAlerta).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolver({ ok: true });
    });
  });
});

// R3.2 a): las reglas de `decidirDestino` y su orden (T-048, ronda 3).
describe('decidirDestino: reglas en orden', () => {
  const pend = (extra: Partial<Pendiente> = {}): Pendiente => ({
    alertaId: 'x1',
    pacienteId: 'pX',
    prefijo: 'pagina',
    indice: 0,
    eraUltimo: false,
    ...extra,
  });
  const pac = (id: string, alertas: string[] = [`${id}-a`]) => ({ id, alertas, anuncio: `${id}, anuncio` });
  const bloque = (pacientes: ReturnType<typeof pac>[], prefijo: 'pagina' | 'busqueda' = 'pagina') => ({
    prefijo,
    encabezadoId: 'titulo',
    pacientes,
  });

  it.each([
    ['la alerta sigue pintada: esperar', pend(), bloque([pac('pX', ['x1'])]), null],
    [
      'el paciente sigue, con su prefijo: su enlace y su anuncio',
      pend(),
      bloque([pac('pX'), pac('pY')]),
      { id: 'pagina-paciente-pX', texto: 'Marcada como resuelta. pX, anuncio' },
    ],
    [
      'el paciente sigue, con prefijo ajeno: el enlace lleva el prefijo del bloque',
      pend({ prefijo: 'busqueda' }),
      bloque([pac('pX')]),
      { id: 'pagina-paciente-pX', texto: 'Marcada como resuelta. pX, anuncio' },
    ],
    [
      'lista vacía: el encabezado',
      pend({ eraUltimo: true }),
      bloque([]),
      { id: 'titulo', texto: 'Marcada como resuelta.' },
    ],
    [
      'lista vacía con prefijo ajeno: el encabezado (vacía va antes que ajeno)',
      pend({ prefijo: 'busqueda' }),
      bloque([]),
      { id: 'titulo', texto: 'Marcada como resuelta.' },
    ],
    [
      'prefijo ajeno y paciente ausente: el encabezado',
      pend({ prefijo: 'busqueda', indice: 1, eraUltimo: true }),
      bloque([pac('pA'), pac('pB')]),
      { id: 'titulo', texto: 'Marcada como resuelta.' },
    ],
    [
      'eraUltimo: el último de la lista nueva',
      pend({ indice: 0, eraUltimo: true }),
      bloque([pac('pA'), pac('pB'), pac('pC')]),
      { id: 'pagina-paciente-pC', texto: 'Marcada como resuelta.' },
    ],
    [
      'gemelo de eraUltimo: no lo era, su índice',
      pend({ indice: 1, eraUltimo: false }),
      bloque([pac('pA'), pac('pB'), pac('pC')]),
      { id: 'pagina-paciente-pB', texto: 'Marcada como resuelta.' },
    ],
    [
      'min(indice): el índice pasa de largo y se queda en el último',
      pend({ indice: 9, eraUltimo: false }),
      bloque([pac('pA'), pac('pB')]),
      { id: 'pagina-paciente-pB', texto: 'Marcada como resuelta.' },
    ],
    [
      'gemelo de min(indice): un índice dentro de la lista no se recorta',
      pend({ indice: 0, eraUltimo: false }),
      bloque([pac('pA'), pac('pB')]),
      { id: 'pagina-paciente-pA', texto: 'Marcada como resuelta.' },
    ],
  ])('%s', (_titulo, pendiente, b, esperado) => {
    expect(decidirDestino(pendiente, b)).toEqual(esperado);
  });
});

describe('MemoriaResolucion: cerrar y Activity (T-048, ronda 3)', () => {
  beforeEach(() => m.resolverAlerta.mockReset());

  it('cerrar es idempotente por identidad del Pendiente: el segundo cierre del mismo objeto no anuncia', async () => {
    const memoria: { actual: ContextType<typeof ContextoMemoria> } = { actual: null };
    function Espia() {
      const c = useContext(ContextoMemoria);
      useEffect(() => {
        memoria.actual = c;
      });
      return null;
    }
    render(
      <MemoriaResolucion>
        <Espia />
      </MemoriaResolucion>,
    );
    const p: Pendiente = { alertaId: 'a', pacienteId: 'pA', prefijo: 'panel', indice: 0, eraUltimo: false };
    await act(async () => {
      memoria.actual!.cerrar(p, 'primero');
      memoria.actual!.cerrar(p, 'segundo');
    });
    expect(estadoBloque().textContent).toBe('primero');
    // Otro objeto, aunque sea la misma alerta: es otro acierto y se anuncia.
    await act(async () => memoria.actual!.cerrar({ ...p }, 'tercero'));
    expect(estadoBloque().textContent).toBe('tercero');
  });

  it('con StrictMode, un acierto anuncia una sola vez y la región es un solo nodo', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    const { rerender } = render(
      <StrictMode>
        <Bloque pacientes={[ANA, { id: 'pB', alertas: ['b1'] }]} />
      </StrictMode>,
    );
    await pulsar();
    rerender(
      <StrictMode>
        <Bloque pacientes={[{ id: 'pB', alertas: ['b1'] }]} />
      </StrictMode>,
    );
    expect(document.querySelectorAll('[data-estado-bloque]')).toHaveLength(1);
    expect(estadoBloque().textContent).toBe('Marcada como resuelta.');
  });

  it('la memoria oculta por Activity tira el pendiente: al volver, nada roba el foco ni anuncia', async () => {
    m.resolverAlerta.mockResolvedValue({ ok: true });
    const B2 = { id: 'pB', alertas: ['b1'] };
    const C2 = { id: 'pC', alertas: ['c1'] };
    const Arnes = ({ modo, pacientes }: { modo: 'visible' | 'hidden'; pacientes: Paciente[] }) => (
      <Activity mode={modo}>
        <MemoriaResolucion>
          <Bloque pacientes={pacientes} />
        </MemoriaResolucion>
      </Activity>
    );
    const { rerender } = render(<Arnes modo="visible" pacientes={[ANA, B2, C2]} />);
    await pulsar();
    // Se sale de la ruta antes de que la revalidación llegue; la lista cambia con la ruta oculta.
    rerender(<Arnes modo="hidden" pacientes={[ANA, B2, C2]} />);
    rerender(<Arnes modo="hidden" pacientes={[B2, C2]} />);
    rerender(<Arnes modo="visible" pacientes={[B2, C2]} />);
    expect(document.activeElement).not.toBe(document.getElementById('panel-paciente-pB'));
    expect(document.activeElement).toBe(document.body);
    expect(estadoBloque().textContent).toBe('');
  });
});
