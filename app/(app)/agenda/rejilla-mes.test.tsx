import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { citaDePrueba, diasDePrueba } from './fixtures-cita';
import { RejillaMes } from './rejilla-mes';
import type { DiaVista } from './vista';

const FECHAS = [
  ...[28, 29, 30].map((d) => `2026-09-${d}`),
  ...Array.from({ length: 31 }, (_, d) => `2026-10-${String(d + 1).padStart(2, "0")}`),
  ...Array.from({ length: 8 }, (_, d) => `2026-11-0${d + 1}`),
];

/** Seis semanas desde el lunes 28 de septiembre: 42 días, los del mes (30 dias de septiembre) y los de fuera. */
function diasDelMes(): DiaVista[] {
  const base = diasDePrueba();
  return Array.from({ length: 42 }, (_, i) => {
    const fecha = FECHAS[i];
    const numero = String(Number(fecha.slice(8)));
    return {
      ...base[i % 7],
      fecha,
      numero,
      etiquetaLarga: `día ${fecha}`,
      esHoy: fecha === '2026-09-29',
      delMes: fecha >= '2026-10-01' && fecha <= '2026-10-31',
    };
  });
}

function montar(extra: Partial<React.ComponentProps<typeof RejillaMes>> = {}) {
  const props = {
    titulo: 'Octubre de 2026',
    dias: diasDelMes(),
    citas: [] as ReturnType<typeof citaDePrueba>[],
    diaInicial: 1,
    alAbrirDia: vi.fn(),
    alAbrirCita: vi.fn(),
    ...extra,
  };
  render(<RejillaMes {...props} />);
  return props;
}

describe('RejillaMes · estructura', () => {
  it('es una rejilla con siete cabeceras de columna y seis filas de siete celdas', () => {
    montar();
    const rejilla = screen.getByRole('grid', { name: 'Octubre de 2026' });
    expect(within(rejilla).getAllByRole('columnheader')).toHaveLength(7);
    expect(within(rejilla).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'lun',
      'mar',
      'mié',
      'jue',
      'vie',
      'sáb',
      'dom',
    ]);
    expect(within(rejilla).getAllByRole('gridcell')).toHaveLength(42);
    expect(within(rejilla).getAllByRole('row')).toHaveLength(7);
  });

  it('los días de fuera del mes se pintan con el gris del texto secundario, no con opacidad', () => {
    montar();
    const fuera = document.querySelector('[data-dia="2026-09-28"]') as HTMLElement;
    const dentro = document.querySelector('[data-dia="2026-10-05"]') as HTMLElement;
    expect(fuera.className).toContain('text-muted-foreground');
    expect(fuera.className).not.toMatch(/opacity/);
    expect(dentro.className).not.toContain('text-muted-foreground');
  });

  it('el botón de cada día dice cuántas citas tiene', () => {
    montar({
      citas: [citaDePrueba({ id: 'a', diaIndice: 1 }), citaDePrueba({ id: 'b', diaIndice: 1 })],
    });
    expect(document.querySelector('[data-dia="2026-09-29"]')).toHaveTextContent('2 citas');
    expect(document.querySelector('[data-dia="2026-09-30"]')).toHaveTextContent('Sin citas');
  });
});

describe('RejillaMes · contenido de la celda', () => {
  const cuatro = [
    citaDePrueba({ id: 'a', nombreCorto: 'Aa', horaLocal: '09:00', diaIndice: 1, minutoPared: 540 }),
    citaDePrueba({ id: 'b', nombreCorto: 'Bb', horaLocal: '10:00', diaIndice: 1, minutoPared: 600 }),
    citaDePrueba({ id: 'c', nombreCorto: 'Cc', horaLocal: '11:00', diaIndice: 1, minutoPared: 660 }),
    citaDePrueba({ id: 'd', nombreCorto: 'Dd', horaLocal: '12:00', diaIndice: 1, minutoPared: 720 }),
  ];

  it('muestra hasta tres citas con hora y nombre, y un «+N más» para el resto', async () => {
    const user = userEvent.setup();
    const props = montar({ citas: cuatro });
    expect(screen.getByRole('button', { name: /09:00 Aa/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /11:00 Cc/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /12:00 Dd/ })).toBeNull();
    const mas = screen.getByRole('button', { name: '+1 más' });
    await user.click(mas);
    expect(props.alAbrirDia).toHaveBeenCalledWith(expect.objectContaining({ fecha: '2026-09-29' }), mas);
  });

  it('pulsar una cita la abre con su botón como ancla', async () => {
    const user = userEvent.setup();
    const props = montar({ citas: cuatro });
    const cita = screen.getByRole('button', { name: /10:00 Bb/ });
    await user.click(cita);
    expect(props.alAbrirCita).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), cita);
  });

  it('a menos de sm hay un punto por estado presente, en el orden de la leyenda', () => {
    montar({
      citas: [
        citaDePrueba({ id: 'a', estado: 'realizada', diaIndice: 1 }),
        citaDePrueba({ id: 'b', estado: 'programada', diaIndice: 1 }),
        citaDePrueba({ id: 'c', estado: 'realizada', diaIndice: 1 }),
      ],
    });
    const puntos = document.querySelectorAll('[data-dia="2026-09-29"]')[0]
      .closest('[role="gridcell"]')!
      .querySelectorAll('[data-puntos] [data-forma]');
    expect([...puntos].map((p) => p.getAttribute('data-forma'))).toEqual(['programada', 'realizada']);
  });

  it('nada late en el mes', () => {
    montar({ citas: [citaDePrueba({ id: 'a', estado: 'en_curso', late: true, diaIndice: 1 })] });
    expect(document.querySelector('.latido-estado')).toBeNull();
  });
});

describe('RejillaMes · teclado', () => {
  it('flechas mueven el foco por las celdas; Abajo salta una semana y Fin va al domingo', async () => {
    const user = userEvent.setup();
    montar();
    const dia = (i: number) => document.querySelectorAll<HTMLElement>('[data-dia]')[i];
    expect(document.querySelectorAll('[data-dia][tabindex="0"]')).toHaveLength(1);
    dia(1).focus();
    await user.keyboard('{ArrowRight}');
    expect(dia(2)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(dia(9)).toHaveFocus();
    await user.keyboard('{End}');
    expect(dia(13)).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(dia(41)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(dia(41)).toHaveFocus();
  });

  it('Intro sobre el número del día abre el panel del día', async () => {
    const user = userEvent.setup();
    const props = montar();
    const boton = document.querySelector<HTMLElement>('[data-dia="2026-10-05"]')!;
    boton.focus();
    await user.keyboard('{Enter}');
    expect(props.alAbrirDia).toHaveBeenCalledWith(expect.objectContaining({ fecha: '2026-10-05' }), boton);
  });
});
