import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificacionVista } from '@/lib/citas/avisos';

const m = vi.hoisted(() => ({
  marcarNotificacionLeida: vi.fn(),
  marcarTodasLeidas: vi.fn(),
}));

vi.mock('./acciones-avisos', () => ({
  marcarNotificacionLeida: (id: string) => m.marcarNotificacionLeida(id),
  marcarTodasLeidas: () => m.marcarTodasLeidas(),
}));

const { Campana } = await import('./campana');

function vista(parcial: Partial<NotificacionVista> & { id: string }): NotificacionVista {
  return {
    tipo: 'nota_pendiente_escalada',
    titulo: null,
    detalle: 'Detalle de prueba.',
    fecha: '25/08/2026',
    leida: false,
    ...parcial,
  };
}

beforeEach(() => {
  m.marcarNotificacionLeida.mockReset();
  m.marcarNotificacionLeida.mockResolvedValue({ ok: true });
  m.marcarTodasLeidas.mockReset();
  m.marcarTodasLeidas.mockResolvedValue({ ok: true });
});

async function abrir(notificaciones: NotificacionVista[]) {
  const usuario = userEvent.setup();
  render(<Campana notificaciones={notificaciones} />);
  const boton = screen.getByRole('button', { name: /^Notificaciones/ });
  await usuario.click(boton);
  return { usuario, panel: screen.getByRole('dialog') };
}

describe('Campana', () => {
  it('el disparador dice cuántas hay sin leer y enseña el contador', () => {
    render(
      <Campana
        notificaciones={[vista({ id: 'a' }), vista({ id: 'b' }), vista({ id: 'c', leida: true })]}
      />,
    );
    const boton = screen.getByRole('button', { name: 'Notificaciones, 2 sin leer' });
    expect(boton.textContent).toContain('2');
  });

  it('gemela: sin ninguna sin leer, ni contador ni «sin leer» en el nombre', () => {
    render(<Campana notificaciones={[vista({ id: 'c', leida: true })]} />);
    const boton = screen.getByRole('button', { name: 'Notificaciones' });
    expect(boton.textContent).toBe('');
  });

  it('las no leídas van primero, aunque lleguen después', async () => {
    const { panel } = await abrir([
      vista({ id: 'leida', leida: true, detalle: 'Ya leída.' }),
      vista({ id: 'nueva', detalle: 'Sin leer.' }),
    ]);
    const filas = within(panel).getAllByRole('listitem');
    expect(filas[0].textContent).toContain('Sin leer.');
    expect(filas[1].textContent).toContain('Ya leída.');
  });

  it('«Marcar como leída» solo aparece en las no leídas', async () => {
    const { panel } = await abrir([
      vista({ id: 'leida', leida: true, detalle: 'Ya leída.' }),
      vista({ id: 'nueva', detalle: 'Sin leer.' }),
    ]);
    const filas = within(panel).getAllByRole('listitem');
    expect(within(filas[0]).getByRole('button', { name: 'Marcar como leída' })).toBeTruthy();
    expect(within(filas[1]).queryByRole('button', { name: 'Marcar como leída' })).toBeNull();
  });

  it('marcar como leída llama a la acción con el id y la marca al momento', async () => {
    const { usuario, panel } = await abrir([vista({ id: 'nueva', detalle: 'Sin leer.' })]);
    await usuario.click(within(panel).getByRole('button', { name: 'Marcar como leída' }));
    expect(m.marcarNotificacionLeida).toHaveBeenCalledWith('nueva');
    expect(within(panel).queryByRole('button', { name: 'Marcar como leída' })).toBeNull();
  });

  it('«Marcar todas como leídas» solo si hay alguna sin leer', async () => {
    const { usuario, panel } = await abrir([vista({ id: 'a' }), vista({ id: 'b' })]);
    await usuario.click(within(panel).getByRole('button', { name: 'Marcar todas como leídas' }));
    expect(m.marcarTodasLeidas).toHaveBeenCalledTimes(1);
  });

  it('gemela: con todo leído no hay «Marcar todas»', async () => {
    const { panel } = await abrir([vista({ id: 'a', leida: true })]);
    expect(within(panel).queryByRole('button', { name: 'Marcar todas como leídas' })).toBeNull();
  });

  it('no hay ninguna acción destructiva: ni borrar ni archivar ni botón destructivo', async () => {
    const { panel } = await abrir([vista({ id: 'a' }), vista({ id: 'b', leida: true })]);
    const botones = within(panel).getAllByRole('button');
    for (const boton of botones) {
      expect(boton.textContent).not.toMatch(/borrar|eliminar|archivar|quitar/i);
      expect(boton.className).not.toContain('destructiv');
    }
  });

  it('el título es el de la notificación, o la etiqueta del tipo si falta', async () => {
    const { panel } = await abrir([
      vista({ id: 'a', titulo: 'Título propio', tipo: 'pin_bloqueado' }),
      vista({ id: 'b', titulo: null, tipo: 'pin_bloqueado' }),
    ]);
    const filas = within(panel).getAllByRole('listitem');
    expect(filas[0].textContent).toContain('Título propio');
    expect(filas[1].textContent).toContain('PIN bloqueado');
  });

  it('con un tipo desconocido sale «Aviso»', async () => {
    const { panel } = await abrir([vista({ id: 'a', titulo: null, tipo: 'tipo_inventado' })]);
    expect(within(panel).getByRole('listitem').textContent).toContain('Aviso');
  });

  it('enseña el detalle y la fecha', async () => {
    const { panel } = await abrir([vista({ id: 'a', detalle: 'Ana tiene sin firmar la nota.' })]);
    const fila = within(panel).getByRole('listitem');
    expect(fila.textContent).toContain('Ana tiene sin firmar la nota.');
    expect(fila.textContent).toContain('25/08/2026');
  });

  it('sin notificaciones: «No tienes notificaciones.» y nada que marcar', async () => {
    const { panel } = await abrir([]);
    expect(panel.textContent).toContain('No tienes notificaciones.');
    expect(within(panel).queryByRole('list')).toBeNull();
    expect(within(panel).queryByRole('button', { name: /Marcar/ })).toBeNull();
  });
});

describe('Campana: fallos de las acciones (T-015, R3)', () => {
  const ERROR_UNA = 'No se ha podido marcar como leída.';
  const ERROR_TODAS = 'No se han podido marcar como leídas.';

  function estado() {
    return screen.getByRole('status');
  }

  it('el status existe vacío antes de actuar, fuera del panel y sin ningún role="alert"', async () => {
    const { container } = render(<Campana notificaciones={[vista({ id: 'a' })]} />);
    expect(estado().textContent).toBe('');
    expect(estado().getAttribute('aria-live')).toBe('polite');
    expect(container.querySelector('[role="alert"]')).toBeNull();

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole('button', { name: /^Notificaciones/ }));
    expect(within(screen.getByRole('dialog')).queryByRole('status')).toBeNull();
  });

  it.each([
    ['rechaza', () => m.marcarNotificacionLeida.mockRejectedValue(new Error('red'))],
    ['da ok:false', () => m.marcarNotificacionLeida.mockResolvedValue({ ok: false })],
  ])('una notificación: si la acción %s no se lanza nada, vuelve a no leída y se anuncia', async (_n, preparar) => {
    preparar();
    const { usuario, panel } = await abrir([vista({ id: 'a' })]);
    await usuario.click(within(panel).getByRole('button', { name: 'Marcar como leída' }));

    expect(await screen.findByText(ERROR_UNA)).toBeTruthy();
    expect(estado().textContent).toBe(ERROR_UNA);
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Marcar como leída' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notificaciones, 1 sin leer' })).toBeTruthy();
  });

  it.each([
    ['rechaza', () => m.marcarTodasLeidas.mockRejectedValue(new Error('red'))],
    ['da ok:false', () => m.marcarTodasLeidas.mockResolvedValue({ ok: false })],
  ])('todas: si la acción %s no se lanza nada, vuelven a no leídas y se anuncia', async (_n, preparar) => {
    preparar();
    const { usuario, panel } = await abrir([vista({ id: 'a' }), vista({ id: 'b' })]);
    await usuario.click(within(panel).getByRole('button', { name: 'Marcar todas como leídas' }));

    expect(await screen.findByText(ERROR_TODAS)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notificaciones, 2 sin leer' })).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Marcar como leída' })).toHaveLength(2);
  });

  it('un redirect de Next (sesión caducada) no se traga: sale hacia React, sin revertir ni anunciar', async () => {
    const redireccion = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
    m.marcarNotificacionLeida.mockRejectedValue(redireccion);
    const errores: unknown[] = [];
    const alError = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      errores.push(e);
    };
    window.addEventListener('error', alError, { capture: true });
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    consola.mockClear();

    const { usuario, panel } = await abrir([vista({ id: 'a' })]);
    await usuario.click(within(panel).getByRole('button', { name: 'Marcar como leída' }));
    await new Promise((r) => setTimeout(r, 20));

    expect(errores.length).toBeGreaterThan(0);
    expect(screen.queryByText(ERROR_UNA)).toBeNull();
    expect(consola.mock.calls.some((c) => String(c[0]).includes('la acción ha fallado'))).toBe(false);

    window.removeEventListener('error', alError, { capture: true });
    consola.mockRestore();
  });

  it('un segundo fallo idéntico cambia el nodo del anuncio (se vuelve a leer)', async () => {
    m.marcarNotificacionLeida.mockResolvedValue({ ok: false });
    const { usuario, panel } = await abrir([vista({ id: 'a' })]);
    await usuario.click(within(panel).getByRole('button', { name: 'Marcar como leída' }));
    const primero = (await screen.findByText(ERROR_UNA)) as HTMLElement;

    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Marcar como leída' }));
    await vi.waitFor(() => expect(m.marcarNotificacionLeida).toHaveBeenCalledTimes(2));
    const segundo = (await screen.findByText(ERROR_UNA)) as HTMLElement;
    expect(segundo).not.toBe(primero);
  });

  it('con éxito se anuncia, también si el panel se cierra', async () => {
    const { usuario, panel } = await abrir([vista({ id: 'a' })]);
    await usuario.click(within(panel).getByRole('button', { name: 'Marcar como leída' }));
    expect(await screen.findByText('Marcada como leída.')).toBeTruthy();

    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(estado().textContent).toBe('Marcada como leída.');
  });

  it('todas con éxito: se anuncia', async () => {
    const { usuario, panel } = await abrir([vista({ id: 'a' }), vista({ id: 'b' })]);
    await usuario.click(within(panel).getByRole('button', { name: 'Marcar todas como leídas' }));
    expect(await screen.findByText('Todas las notificaciones están marcadas como leídas.')).toBeTruthy();
  });
});

describe('Campana: adónde va el foco (T-015, R4)', () => {
  function botonesMarcar() {
    return within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Marcar como leída' });
  }

  it('con dos sin leer, marcar la primera deja el foco en el botón de la otra', async () => {
    const { usuario } = await abrir([vista({ id: 'a', detalle: 'Uno.' }), vista({ id: 'b', detalle: 'Dos.' })]);
    await usuario.click(botonesMarcar()[0]);
    const restantes = botonesMarcar();
    expect(restantes).toHaveLength(1);
    expect(document.activeElement).toBe(restantes[0]);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('si era la última de la lista, el foco va a la anterior sin leer', async () => {
    const { usuario } = await abrir([vista({ id: 'a' }), vista({ id: 'b' }), vista({ id: 'c' })]);
    await usuario.click(botonesMarcar()[2]);
    const restantes = botonesMarcar();
    expect(restantes).toHaveLength(2);
    expect(document.activeElement).toBe(restantes[1]);
  });

  it('si era la única sin leer, el foco va al panel', async () => {
    const { usuario } = await abrir([vista({ id: 'a' }), vista({ id: 'l', leida: true })]);
    await usuario.click(botonesMarcar()[0]);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('«Marcar todas» deja el foco en el panel', async () => {
    const { usuario, panel } = await abrir([vista({ id: 'a' }), vista({ id: 'b' })]);
    await usuario.click(within(panel).getByRole('button', { name: 'Marcar todas como leídas' }));
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('si falla y revierte, el foco no se mueve del destino ya elegido', async () => {
    m.marcarNotificacionLeida.mockResolvedValue({ ok: false });
    const { usuario } = await abrir([vista({ id: 'a' }), vista({ id: 'b' })]);
    await usuario.click(botonesMarcar()[0]);
    await screen.findByText('No se ha podido marcar como leída.');
    // Se eligió el botón de la segunda; tras revertir, la primera vuelve pero el foco sigue ahí.
    expect(document.activeElement).toBe(botonesMarcar()[1]);
  });

  function pendiente() {
    let falla!: () => void;
    const promesa = new Promise<{ ok: boolean }>((resolver) => {
      falla = () => resolver({ ok: false });
    });
    return { promesa, falla };
  }

  it('con la acción pendiente, quien mueve el foco a otro botón del panel no lo pierde cuando falla (B2-H1)', async () => {
    const p = pendiente();
    m.marcarNotificacionLeida.mockReturnValue(p.promesa);
    const { usuario } = await abrir([vista({ id: 'a' }), vista({ id: 'b' }), vista({ id: 'c' })]);
    await usuario.click(botonesMarcar()[0]);
    // Se eligió el botón de B; la persona tabula a C mientras la red tarda.
    expect(botonesMarcar()).toHaveLength(2);
    expect(document.activeElement).toBe(botonesMarcar()[0]);
    botonesMarcar()[1].focus();
    expect(document.activeElement).toBe(botonesMarcar()[1]);

    await act(async () => {
      p.falla();
    });
    await screen.findByText('No se ha podido marcar como leída.');

    // A vuelve la primera; el foco sigue en C (ahora la tercera), no salta a B.
    expect(botonesMarcar()).toHaveLength(3);
    expect(document.activeElement).toBe(botonesMarcar()[2]);
  });

  it('si el foco se había perdido (body) cuando falla, vuelve al destino elegido (B2-H1)', async () => {
    const p = pendiente();
    m.marcarNotificacionLeida.mockReturnValue(p.promesa);
    const { usuario } = await abrir([vista({ id: 'a' }), vista({ id: 'b' }), vista({ id: 'c' })]);
    await usuario.click(botonesMarcar()[0]);
    expect(document.activeElement).toBe(botonesMarcar()[0]);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    await act(async () => {
      p.falla();
    });
    await screen.findByText('No se ha podido marcar como leída.');

    // El destino elegido fue B: tras revertir, la segunda de la lista (A es la primera).
    expect(document.activeElement).toBe(botonesMarcar()[1]);
  });
});
