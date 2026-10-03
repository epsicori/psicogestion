import { render, screen, within } from '@testing-library/react';
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
