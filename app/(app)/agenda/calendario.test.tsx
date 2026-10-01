import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PX_MIN } from './arrastre';
import { citaDePrueba, diasDePrueba } from './fixtures-cita';
import type { VistaCalendario } from './vista';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

// FilaPropuesta importa las acciones, que tocan Supabase: aquí no se ejecuta ninguna.
vi.mock('./acciones', () => ({
  confirmarPropuestaAgenda: vi.fn(),
  descartarPropuestaAgenda: vi.fn(),
  reprogramar: vi.fn(),
  previsualizarMovimiento: vi.fn(),
}));

// Las resoluciones que el diálogo entrega «tarde»: se disparan a mano, cuando la prueba quiere.
const tardias = vi.hoisted(() => [] as Array<() => void>);

// El diálogo tiene su propia prueba: aquí solo importa cómo lo abre el calendario y qué hace con
// lo que devuelve.
vi.mock('./dialogo-reprogramar', () => ({
  DialogoReprogramar: (p: {
    cita: { id: string };
    inicial: { fecha: string; hora: string };
    desdeArrastre: boolean;
    alCerrar: () => void;
    alMovida: (anuncio: string) => void;
  }) => (
    <div role="dialog" aria-label="Reprogramar la cita" data-inicial={`${p.inicial.fecha} ${p.inicial.hora}`} data-arrastre={String(p.desdeArrastre)}>
      <button type="button" onClick={p.alCerrar}>
        cerrar-dialogo
      </button>
      <button type="button" onClick={() => p.alMovida('Cita movida al 30 a las 14:00.')}>
        movida
      </button>
      <button type="button" onClick={() => tardias.push(() => p.alMovida('Cita movida tarde.'))}>
        movida-tarde
      </button>
    </div>
  ),
}));

const { Calendario } = await import('./calendario');
const acciones = await import('./acciones');

function vistaDePrueba(extra: Partial<VistaCalendario> = {}): VistaCalendario {
  return {
    vista: 'semana',
    zona: 'Europe/Madrid',
    hoy: '2026-09-29',
    fechaFoco: '2026-09-29',
    anterior: '2026-09-22',
    siguiente: '2026-10-06',
    titulo: '28 de septiembre – 4 de octubre de 2026',
    dias: diasDePrueba(),
    eje: { desdeMinuto: 420, hastaMinuto: 1260, horas: ['07:00', '08:00'] },
    citas: [citaDePrueba({ reprogramable: true })],
    profesionales: [
      { id: 'p1', nombre: 'Lucía Márquez' },
      { id: 'p2', nombre: 'Pablo Ruiz' },
    ],
    ...extra,
  };
}

function montar(extra: Partial<React.ComponentProps<typeof Calendario>> = {}) {
  return render(
    <Calendario
      vista={vistaDePrueba()}
      parametros={{ centro: null, profesional: null }}
      centros={[
        { id: 'c1', nombre: 'Centro Norte' },
        { id: 'c2', nombre: 'Centro Sur' },
      ]}
      centroElegido="todos"
      rol="administrador"
      {...extra}
    />,
  );
}

const enGrid = () => within(screen.getByRole('grid'));

beforeEach(() => {
  replace.mockClear();
  tardias.length = 0;
  // jsdom no maqueta: `offsetParent` es siempre null. Aquí, como en un navegador ancho, todo
  // tiene caja salvo lo que lleva `hidden`; el bloque de 360 px lo estrecha.
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
    return this.closest('[hidden]') ? null : document.body;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Calendario · barra', () => {
  it('anterior, hoy y siguiente son enlaces que conservan el resto de los parámetros', () => {
    montar({ parametros: { centro: 'c1', profesional: 'p2' } });
    const anterior = screen.getByRole('link', { name: 'Semana anterior' });
    const siguiente = screen.getByRole('link', { name: 'Semana siguiente' });
    const hoy = screen.getByRole('link', { name: 'Hoy' });
    expect(anterior).toHaveAttribute('href', '/agenda?vista=semana&fecha=2026-09-22&centro=c1&profesional=p2');
    expect(siguiente).toHaveAttribute('href', '/agenda?vista=semana&fecha=2026-10-06&centro=c1&profesional=p2');
    expect(hoy).toHaveAttribute('href', '/agenda?vista=semana&centro=c1&profesional=p2');
  });

  it('en el mes los enlaces dicen mes', () => {
    montar({ vista: vistaDePrueba({ vista: 'mes' }) });
    expect(screen.getByRole('link', { name: 'Mes anterior' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mes siguiente' })).toBeInTheDocument();
  });

  it('el conmutador marca la vista actual y lleva a la otra desde el día en foco', async () => {
    const user = userEvent.setup();
    montar();
    const grupo = screen.getByRole('group', { name: 'Vista del calendario' });
    expect(within(grupo).getByRole('link', { name: 'Semana' })).toHaveAttribute('aria-current', 'page');
    expect(within(grupo).getByRole('link', { name: 'Mes' })).toHaveAttribute('href', '/agenda?vista=mes&fecha=2026-09-29');

    // Abrir el jueves 1 de octubre cambia el día en foco: el mes que se abra es el suyo.
    await user.click(enGrid().getByRole('button', { name: /jue 1/ }));
    expect(within(grupo).getByRole('link', { name: 'Mes' })).toHaveAttribute('href', '/agenda?vista=mes&fecha=2026-10-01');
  });

  it('el filtro de centro solo aparece con dos o más centros, y elegir uno cambia la URL', async () => {
    const user = userEvent.setup();
    const { unmount } = montar();
    await user.selectOptions(screen.getByLabelText('Centro'), 'c2');
    expect(replace).toHaveBeenCalledWith('/agenda?vista=semana&fecha=2026-09-29&centro=c2', { scroll: false });
    await user.selectOptions(screen.getByLabelText('Centro'), '');
    expect(replace).toHaveBeenLastCalledWith('/agenda?vista=semana&fecha=2026-09-29&centro=todos', { scroll: false });
    unmount();

    montar({ centros: [{ id: 'c1', nombre: 'Centro Norte' }] });
    expect(screen.queryByLabelText('Centro')).toBeNull();
  });

  it('el filtro de profesional no se ofrece a un profesional sanitario', async () => {
    const user = userEvent.setup();
    const { unmount } = montar();
    await user.selectOptions(screen.getByLabelText('Profesional'), 'p2');
    expect(replace).toHaveBeenCalledWith('/agenda?vista=semana&fecha=2026-09-29&profesional=p2', { scroll: false });
    unmount();

    montar({ rol: 'profesional_sanitario' });
    expect(screen.queryByLabelText('Profesional')).toBeNull();
  });

  it('la leyenda de estados está y hay un anunciador de estado vacío', () => {
    montar();
    expect(screen.getByText('Leyenda')).toBeInTheDocument();
    expect(screen.getAllByRole('status').some((s) => s.textContent === '')).toBe(true);
  });

  it('a 360 y a más ancho hay dos formas de la semana: rejilla y lista del día', () => {
    montar();
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Días de la semana' })).toBeInTheDocument();
  });
});

describe('Calendario · paneles y foco', () => {
  it('abrir un día muestra su panel; Escape lo cierra y el foco vuelve al número del día', async () => {
    const user = userEvent.setup();
    montar();
    const dia = enGrid().getByRole('button', { name: /mar 29/ });
    await user.click(dia);
    expect(screen.getByRole('dialog', { name: 'martes, 29 de septiembre de 2026' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dia).toHaveFocus();
  });

  it('de la cita al día y del día al número: Escape sube un escalón cada vez (D9)', async () => {
    const user = userEvent.setup();
    montar();
    const dia = enGrid().getByRole('button', { name: /mar 29/ });
    await user.click(dia);

    const panelDia = screen.getByRole('dialog', { name: 'martes, 29 de septiembre de 2026' });
    const fila = within(panelDia).getByRole('button', { name: /Ana G\./ });
    await user.click(fila);
    expect(screen.getByRole('dialog', { name: 'Ana García López' })).toBeInTheDocument();
    // Solo se pinta la cima (revisión TS H3): el panel del día no se ve ni lo alcanza el lector.
    expect(screen.queryByRole('dialog', { name: 'martes, 29 de septiembre de 2026' })).toBeNull();
    expect(panelDia).toHaveAttribute('hidden');
    expect(panelDia).toHaveAttribute('inert');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Ana García López' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'martes, 29 de septiembre de 2026' })).toBeInTheDocument();
    expect(fila).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dia).toHaveFocus();
  });

  it('«Reprogramar» del panel abre el diálogo con la hora de la cita, sin arrastre', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
    await user.click(screen.getByRole('button', { name: 'Reprogramar' }));
    const dialogo = screen.getByRole('dialog', { name: 'Reprogramar la cita' });
    expect(dialogo).toHaveAttribute('data-inicial', '2026-09-29 17:00');
    expect(dialogo).toHaveAttribute('data-arrastre', 'false');
  });

  it('soltar una cita arrastrada abre el diálogo con el destino y con desdeArrastre', () => {
    montar();
    const fila = screen.getByRole('row');
    vi.spyOn(fila, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 700, height: 0, right: 700, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });
    const cuerpo = fila.querySelector('[data-cuerpo]') as HTMLElement;
    vi.spyOn(cuerpo, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 40, width: 100, height: 0, right: 100, bottom: 40, x: 0, y: 40, toJSON: () => ({}) });
    const yCita = 40 + (1020 - 420) * PX_MIN;
    const cita = enGrid().getByRole('button', { name: /Ana G\./ });
    fireEvent.pointerDown(cita, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 150, clientY: yCita + 10 });
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: 250, clientY: yCita + 10 - 3 * 96 });
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: 250, clientY: yCita + 10 - 3 * 96 });
    const dialogo = screen.getByRole('dialog', { name: 'Reprogramar la cita' });
    expect(dialogo).toHaveAttribute('data-inicial', '2026-09-30 14:00');
    expect(dialogo).toHaveAttribute('data-arrastre', 'true');
  });

  it('con el diálogo abierto, los paneles de debajo esperan; al cancelar siguen ahí', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
    await user.click(screen.getByRole('button', { name: 'Reprogramar' }));
    await user.click(screen.getByRole('button', { name: 'cerrar-dialogo' }));
    expect(screen.queryByRole('dialog', { name: 'Reprogramar la cita' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Ana García López' })).toBeInTheDocument();
  });

  it('al mover con éxito se cierra todo, se anuncia y el foco va a la cita', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
    await user.click(screen.getByRole('button', { name: 'Reprogramar' }));
    await user.click(screen.getByRole('button', { name: 'movida' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Cita movida al 30 a las 14:00.')).toBeInTheDocument();
    expect(screen.getByText('Cita movida al 30 a las 14:00.').closest('[role="status"]')).not.toBeNull();
    const enFoco = document.activeElement as HTMLElement;
    expect(enFoco.getAttribute('data-cita-id')).toBe(citaDePrueba().id);
  });
});

describe('Calendario · foco en la disposición visible (revisión TS H4)', () => {
  // Lo que hace el navegador a 360 px: la rejilla (`hidden md:block`) tampoco tiene caja.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
      return this.closest('.hidden, [hidden]') ? null : document.body;
    });
  });

  it('a 360 px, tras mover la cita a otro día, el foco va al número de ese día en la tira', async () => {
    const user = userEvent.setup();
    const { rerender } = montar();
    const lista = within(screen.getByRole('region', { name: 'Citas del día' }));
    await user.click(lista.getByRole('button', { name: /Ana G\./ }));
    await user.click(screen.getByRole('button', { name: 'Reprogramar' }));
    await user.click(screen.getByRole('button', { name: 'movida' }));

    // Llega la vista nueva: la cita está el jueves 1, que la lista (en el martes) no pinta.
    const movida = citaDePrueba({ reprogramable: true, diaIndice: 3, fechaLocal: '2026-10-01', horaLocal: '10:00' });
    rerender(
      <Calendario
        vista={vistaDePrueba({ citas: [movida] })}
        parametros={{ centro: null, profesional: null }}
        centros={[]}
        centroElegido="todos"
        rol="administrador"
      />,
    );

    const tira = within(screen.getByRole('group', { name: 'Días de la semana' }));
    expect(tira.getByRole('button', { name: 'jueves, 1 de octubre de 2026' })).toHaveFocus();
  });

  it('gemela: si la cita sigue en el día que enseña la lista, el foco va a su fila visible', async () => {
    const user = userEvent.setup();
    montar();
    const lista = within(screen.getByRole('region', { name: 'Citas del día' }));
    const fila = lista.getByRole('button', { name: /Ana G\./ });
    await user.click(fila);
    await user.click(screen.getByRole('button', { name: 'Reprogramar' }));
    await user.click(screen.getByRole('button', { name: 'movida' }));
    expect(fila).toHaveFocus();
  });
});

describe('Calendario · panel de la cita con la vista al día (revisión TS H5)', () => {
  const PROPUESTA = { id: '44444444-4444-4444-8444-444444444444', rango: '11:00–11:50' };

  it('el panel pinta la cita de la vista actual, no la copia de cuando se abrió', async () => {
    const user = userEvent.setup();
    const { rerender } = montar({ vista: vistaDePrueba({ citas: [citaDePrueba({ propuestaPendiente: PROPUESTA })] }) });
    await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
    const panel = screen.getByRole('dialog', { name: 'Ana García López' });
    expect(within(panel).getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();

    rerender(
      <Calendario
        vista={vistaDePrueba({ citas: [citaDePrueba({ rango: '18:00–18:50', propuestaPendiente: null })] })}
        parametros={{ centro: null, profesional: null }}
        centros={[]}
        centroElegido="todos"
        rol="administrador"
      />,
    );
    const alDia = screen.getByRole('dialog', { name: 'Ana García López' });
    expect(within(alDia).queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(within(alDia).getByText(/18:00–18:50/)).toBeInTheDocument();
  });

  it('si la cita cambió de día con el panel abierto, Escape lleva el foco a la cita en su sitio nuevo', async () => {
    const user = userEvent.setup();
    const { rerender } = montar();
    const ancla = enGrid().getByRole('button', { name: /Ana G\./ });
    await user.click(ancla);
    rerender(
      <Calendario
        vista={vistaDePrueba({ citas: [citaDePrueba({ diaIndice: 3, fechaLocal: '2026-10-01' })] })}
        parametros={{ centro: null, profesional: null }}
        centros={[]}
        centroElegido="todos"
        rol="administrador"
      />,
    );
    expect(ancla.isConnected).toBe(false);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    const enFoco = document.activeElement as HTMLElement;
    expect(enFoco.getAttribute('data-cita-id')).toBe(citaDePrueba().id);
    expect(enFoco.isConnected).toBe(true);
  });

  it('confirmar la propuesta desde el panel lo cierra, lo anuncia y el foco vuelve a la cita', async () => {
    vi.mocked(acciones.confirmarPropuestaAgenda).mockResolvedValue({ ok: true, anuncio: 'Hecho.' });
    const user = userEvent.setup();
    montar({ vista: vistaDePrueba({ citas: [citaDePrueba({ propuestaPendiente: PROPUESTA })] }) });
    await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Hecho.').closest('[role="status"]')).not.toBeNull();
    expect((document.activeElement as HTMLElement).getAttribute('data-cita-id')).toBe(citaDePrueba().id);
  });

  // Revisión de cierre N1: la vista nueva (sin la propuesta) llega en el mismo commit que el `ok`
  // y se lleva el botón Confirmar; el panel tiene que cerrarse y anunciar igualmente.
  it('si el recargado llega con el ok, el panel igualmente se cierra, anuncia y devuelve el foco', async () => {
    const user = userEvent.setup();
    const props = {
      parametros: { centro: null, profesional: null },
      centros: [],
      centroElegido: 'todos',
      rol: 'administrador' as const,
    };
    const { rerender } = montar({ vista: vistaDePrueba({ citas: [citaDePrueba({ propuestaPendiente: PROPUESTA })] }) });
    vi.mocked(acciones.confirmarPropuestaAgenda).mockImplementation(async () => {
      await Promise.resolve();
      act(() =>
        rerender(<Calendario {...props} vista={vistaDePrueba({ citas: [citaDePrueba({ propuestaPendiente: null })] })} />),
      );
      return { ok: true, anuncio: 'Propuesta confirmada.' };
    });
    await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Propuesta confirmada.').closest('[role="status"]')).not.toBeNull();
    expect((document.activeElement as HTMLElement).getAttribute('data-cita-id')).toBe(citaDePrueba().id);
  });
});

// Revisión B-1: una acción que vuelve tarde no actúa sobre lo que haya abierto en ese momento.
describe('Calendario · resultados que llegan tarde (revisión B-1)', () => {
  const PROPUESTA = { id: '44444444-4444-4444-8444-444444444444', rango: '11:00–11:50' };
  const CITA_B = {
    id: '55555555-5555-4555-8555-555555555555',
    pacienteId: '66666666-6666-4666-8666-666666666666',
    diaIndice: 2,
    fechaLocal: '2026-09-30',
    nombrePaciente: 'Berta Ruiz',
    nombreCorto: 'Berta R.',
  };

  function dosCitas() {
    return vistaDePrueba({
      citas: [citaDePrueba({ propuestaPendiente: PROPUESTA }), citaDePrueba(CITA_B)],
    });
  }

  it('si el panel de la cita ya se cerró y hay otro abierto, el resultado se anuncia pero no lo cierra ni le quita el foco', async () => {
    let resolver: (r: { ok: true; anuncio: string }) => void = () => {};
    vi.mocked(acciones.confirmarPropuestaAgenda).mockImplementation(
      () => new Promise((resolve) => (resolver = resolve as typeof resolver)),
    );
    const user = userEvent.setup();
    montar({ vista: dosCitas() });
    await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await user.keyboard('{Escape}');
    await user.click(enGrid().getByRole('button', { name: /Berta R\./ }));
    const panelB = screen.getByRole('dialog', { name: 'Berta Ruiz' });

    await act(async () => resolver({ ok: true, anuncio: 'Propuesta de Ana confirmada.' }));

    expect(screen.getByRole('dialog', { name: 'Berta Ruiz' })).toBe(panelB);
    expect(panelB.contains(document.activeElement)).toBe(true);
    expect(screen.getByText('Propuesta de Ana confirmada.').closest('[role="status"]')).not.toBeNull();
  });

  it('dos tramos de la misma cita son dos paneles: el resultado de uno no cierra el del otro', async () => {
    let resolver: (r: { ok: true; anuncio: string }) => void = () => {};
    vi.mocked(acciones.confirmarPropuestaAgenda).mockImplementation(
      () => new Promise((resolve) => (resolver = resolve as typeof resolver)),
    );
    const user = userEvent.setup();
    montar({
      vista: vistaDePrueba({
        citas: [
          citaDePrueba({ propuestaPendiente: PROPUESTA }),
          citaDePrueba({ tramo: 1, diaIndice: 2, fechaLocal: '2026-09-30' }),
        ],
      }),
    });
    const [tramo0, tramo1] = enGrid().getAllByRole('button', { name: /Ana G./ });
    await user.click(tramo0);
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await user.keyboard('{Escape}');
    await user.click(tramo1);
    const panel = screen.getByRole('dialog', { name: 'Ana García López' });

    await act(async () => resolver({ ok: true, anuncio: 'Hecho.' }));

    expect(screen.getByRole('dialog', { name: 'Ana García López' })).toBe(panel);
  });

  it('gemela: si el panel que lanzó la acción sigue siendo el abierto, el resultado lo cierra y el foco vuelve a la cita', async () => {
    let resolver: (r: { ok: true; anuncio: string }) => void = () => {};
    vi.mocked(acciones.confirmarPropuestaAgenda).mockImplementation(
      () => new Promise((resolve) => (resolver = resolve as typeof resolver)),
    );
    const user = userEvent.setup();
    montar({ vista: dosCitas() });
    await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await act(async () => resolver({ ok: true, anuncio: 'Hecho.' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect((document.activeElement as HTMLElement).getAttribute('data-cita-id')).toBe(citaDePrueba().id);
  });

  it('si la propuesta vuelve con el diálogo de reprogramar abierto encima, no lo cierra', async () => {
    let resolver: (r: { ok: true; anuncio: string }) => void = () => {};
    vi.mocked(acciones.confirmarPropuestaAgenda).mockImplementation(
      () => new Promise((resolve) => (resolver = resolve as typeof resolver)),
    );
    const user = userEvent.setup();
    montar({ vista: dosCitas() });
    await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await user.click(screen.getByRole('button', { name: 'Reprogramar' }));

    await act(async () => resolver({ ok: true, anuncio: 'Hecho.' }));

    expect(screen.getByRole('dialog', { name: 'Reprogramar la cita' })).toBeInTheDocument();
    expect(screen.getByText('Hecho.').closest('[role="status"]')).not.toBeNull();
  });

  it('si la cita movida ya no tiene su diálogo y hay otro abierto, el resultado se anuncia pero no cierra el otro', async () => {
    const user = userEvent.setup();
    montar({ vista: dosCitas() });
    await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
    await user.click(screen.getByRole('button', { name: 'Reprogramar' }));
    await user.click(screen.getByRole('button', { name: 'movida-tarde' }));
    await user.click(screen.getByRole('button', { name: 'cerrar-dialogo' }));
    await user.keyboard('{Escape}');
    await user.click(enGrid().getByRole('button', { name: /Berta R\./ }));
    await user.click(screen.getByRole('button', { name: 'Reprogramar' }));
    const dialogoB = screen.getByRole('dialog', { name: 'Reprogramar la cita' });

    act(() => tardias[0]());

    expect(screen.getByRole('dialog', { name: 'Reprogramar la cita' })).toBe(dialogoB);
    expect(screen.getByRole('dialog', { name: 'Berta Ruiz' })).toBeInTheDocument();
    expect(screen.getByText('Cita movida tarde.').closest('[role="status"]')).not.toBeNull();
  });
});

// Revisión B-2: dos anuncios idénticos seguidos no cambian el DOM y el lector no vuelve a hablar.
describe('Calendario · anuncios repetidos (revisión B-2)', () => {
  it('al mover dos veces seguidas con el mismo texto, la región cambia (espacio duro alterno)', async () => {
    const user = userEvent.setup();
    montar();
    async function mover() {
      await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
      await user.click(screen.getByRole('button', { name: 'Reprogramar' }));
      await user.click(screen.getByRole('button', { name: 'movida' }));
    }
    const region = () => screen.getByText(/Cita movida al 30/).textContent;
    await mover();
    expect(region()).toBe('Cita movida al 30 a las 14:00.');
    await mover();
    expect(region()).toBe('Cita movida al 30 a las 14:00.\u00A0');
    await mover();
    expect(region()).toBe('Cita movida al 30 a las 14:00.');
  });

  it('lo mismo al resolver una propuesta desde el panel', async () => {
    vi.mocked(acciones.confirmarPropuestaAgenda).mockResolvedValue({ ok: true, anuncio: 'Hecho.' });
    const user = userEvent.setup();
    montar({
      vista: vistaDePrueba({
        citas: [citaDePrueba({ propuestaPendiente: { id: '44444444-4444-4444-8444-444444444444', rango: '11:00–11:50' } })],
      }),
    });
    for (const esperado of ['Hecho.', 'Hecho.\u00A0']) {
      await user.click(enGrid().getByRole('button', { name: /Ana G\./ }));
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByText('Hecho.').textContent).toBe(esperado);
    }
  });
});

// Revisión B-3: el panel de la cita abierta desde el del día se ancla al día cuando su propia
// fila (dentro del panel oculto) no tiene caja. Sin el `respaldo` caería al calendario entero.
describe('Calendario · respaldo del ancla (revisión B-3)', () => {
  it('la cita abierta desde el panel del día se coloca contra el número del día', async () => {
    const DIA = { top: 300, left: 600, width: 40, height: 28 };
    const CALENDARIO = { top: 50, left: 20, width: 1000, height: 700 };
    const PANEL = { top: 0, left: 0, width: 320, height: 240 };
    const SIN_CAJA = { top: 0, left: 0, width: 0, height: 0 };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const r = this.closest('[hidden]')
        ? SIN_CAJA
        : this.getAttribute('role') === 'dialog'
          ? PANEL
          : this.matches('button[data-dia="2026-09-29"]')
            ? DIA
            : CALENDARIO;
      return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) };
    });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);

    const user = userEvent.setup();
    montar();
    await user.click(enGrid().getByRole('button', { name: /mar 29/ }));
    const panelDia = screen.getByRole('dialog', { name: 'martes, 29 de septiembre de 2026' });
    await user.click(within(panelDia).getByRole('button', { name: /Ana G\./ }));
    const panelCita = screen.getByRole('dialog', { name: 'Ana García López' });

    // Contra el número del día: debajo de él (300 + 28 + 8 del pico), no contra el calendario.
    expect(panelCita.style.top).toBe('336px');
  });
});
