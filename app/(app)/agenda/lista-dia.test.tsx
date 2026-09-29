import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { citaDePrueba, diasDePrueba } from './fixtures-cita';
import { ListaDia } from './lista-dia';

function montar(extra: Partial<React.ComponentProps<typeof ListaDia>> = {}) {
  const props = {
    dias: diasDePrueba(),
    citas: [
      citaDePrueba({ id: 'a', nombreCorto: 'Aa', minutoPared: 17 * 60 + 30, horaLocal: '17:30', diaIndice: 1 }),
      citaDePrueba({ id: 'b', nombreCorto: 'Bb', minutoPared: 9 * 60, horaLocal: '09:00', diaIndice: 1 }),
      citaDePrueba({ id: 'c', nombreCorto: 'Cc', minutoPared: 17 * 60, horaLocal: '17:00', diaIndice: 1 }),
      citaDePrueba({ id: 'd', nombreCorto: 'Dd', minutoPared: 10 * 60, horaLocal: '10:00', diaIndice: 3 }),
    ],
    diaInicial: 1,
    alAbrirCita: vi.fn(),
    ...extra,
  };
  render(<ListaDia {...props} />);
  return props;
}

describe('ListaDia', () => {
  it('la tira tiene siete botones de al menos 44 px y solo el del día elegido está pulsado', () => {
    montar();
    const tira = screen.getByRole('group', { name: 'Días de la semana' });
    const botones = within(tira).getAllByRole('button');
    expect(botones).toHaveLength(7);
    expect(botones.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(botones[1]).toHaveAttribute('aria-pressed', 'true');
    for (const b of botones) expect(b.className).toContain('min-h-11');
  });

  it('lista solo las citas del día elegido, ordenadas y agrupadas por hora', () => {
    montar();
    const lista = screen.getByRole('region', { name: 'Citas del día' });
    const nombres = within(lista)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(nombres[0]).toContain('Bb');
    expect(nombres[1]).toContain('Cc');
    expect(nombres[2]).toContain('Aa');
    expect(nombres).toHaveLength(3);
    // Cc y Aa comparten la hora 17:00: una sola cabecera.
    expect(within(lista).getAllByText('17:00', { selector: 'h3' })).toHaveLength(1);
    expect(within(lista).getByText('09:00', { selector: 'h3' })).toBeInTheDocument();
  });

  it('elegir otro día cambia la lista', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: /jueves, 1 de octubre/ }));
    const lista = screen.getByRole('region', { name: 'Citas del día' });
    expect(within(lista).getAllByRole('button')).toHaveLength(1);
    expect(within(lista).getByRole('button')).toHaveTextContent('Dd');
    expect(screen.getByRole('button', { name: /jueves, 1 de octubre/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('un día sin citas lo dice', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: /lunes, 28 de septiembre/ }));
    const lista = screen.getByRole('region', { name: 'Citas del día' });
    expect(within(lista).queryAllByRole('button')).toHaveLength(0);
    expect(within(lista).getByText('Sin citas')).toBeInTheDocument();
  });

  it('las flechas mueven el foco por la tira con tabulación móvil', async () => {
    const user = userEvent.setup();
    montar();
    const botones = within(screen.getByRole('group', { name: 'Días de la semana' })).getAllByRole('button');
    expect(botones.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    botones[1].focus();
    await user.keyboard('{ArrowRight}');
    expect(botones[2]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(botones[0]).toHaveFocus();
  });

  it('pulsar una cita la abre con su botón como ancla', async () => {
    const user = userEvent.setup();
    const props = montar();
    const boton = within(screen.getByRole('region', { name: 'Citas del día' })).getAllByRole('button')[0];
    await user.click(boton);
    expect(props.alAbrirCita).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), boton);
  });

  it('nada late en la lista: el latido es de la rejilla', () => {
    montar({ citas: [citaDePrueba({ id: 'a', late: true, estado: 'en_curso', diaIndice: 1 })] });
    expect(document.querySelector('.latido-estado')).toBeNull();
  });
});
