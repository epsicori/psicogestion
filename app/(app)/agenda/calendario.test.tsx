import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    </div>
  ),
}));

const { Calendario } = await import('./calendario');

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

beforeEach(() => replace.mockClear());

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
