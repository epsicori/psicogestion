import { fireEvent, render, screen, within } from '@testing-library/react';
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

describe('RejillaMes · objetivos táctiles', () => {
  const celdaDe = (fecha: string) => document.querySelector(`[data-dia="${fecha}"]`)!.closest<HTMLElement>('[role="gridcell"]')!;

  // Evidencia, FALLA 1: a 360 px la celda enseña puntos y recuento debajo del número; tocar
  // ahí no hacía nada.
  it('un toque en la parte vacía de la celda abre el día, con su número como ancla', () => {
    const props = montar({ citas: [citaDePrueba({ id: 'a', diaIndice: 1 })] });
    const boton = document.querySelector<HTMLElement>('[data-dia="2026-09-29"]')!;
    fireEvent.click(celdaDe('2026-09-29'));
    expect(props.alAbrirDia).toHaveBeenCalledWith(expect.objectContaining({ fecha: '2026-09-29' }), boton);
    props.alAbrirDia.mockClear();
    fireEvent.click(celdaDe('2026-09-29').querySelector('[data-puntos]')!);
    expect(props.alAbrirDia).toHaveBeenCalledWith(expect.objectContaining({ fecha: '2026-09-29' }), boton);
  });

  it('un toque en una cita o en el número no abre el día dos veces', () => {
    const props = montar({ citas: [citaDePrueba({ id: 'a', nombreCorto: 'Aa', horaLocal: '09:00', diaIndice: 1 })] });
    fireEvent.click(screen.getByRole('button', { name: /09:00 Aa/ }));
    expect(props.alAbrirDia).not.toHaveBeenCalled();
    expect(props.alAbrirCita).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('[data-dia="2026-09-29"]')!);
    expect(props.alAbrirDia).toHaveBeenCalledTimes(1);
  });

  // Evidencia, FALLA 2. A 360 px, con el margen del armazón (px-5) y el de la tarjeta (p-4),
  // siete columnas dan (360 − 40 − 2 − 32) / 7 ≈ 41 px. Sin el de la tarjeta, (360 − 40 − 2) / 7
  // ≈ 45 px por columna: la rejilla sangra hasta el borde de la tarjeta y la celda no se come
  // más. jsdom no maqueta: se comprueban las clases que dan esas cuentas.
  it('por debajo de sm la rejilla sangra hasta el borde de la tarjeta y la celda no tiene relleno', () => {
    montar();
    const rejilla = screen.getByRole('grid');
    expect(rejilla.className.split(' ')).toEqual(expect.arrayContaining(['-mx-4', 'sm:mx-0']));
    for (const celda of screen.getAllByRole('gridcell')) {
      expect(celda.className.split(' ')).toEqual(expect.arrayContaining(['p-0', 'sm:p-0.5']));
    }
  });

  // Revisión TS H8: nada que se toque por debajo de 44 px de alto. Con ratón, las citas del mes
  // conservan su alto compacto; con el dedo (`pointer: coarse`) crecen.
  it('todo botón de la rejilla mide al menos 44 px de alto al tacto', () => {
    const cuatro = ['a', 'b', 'c', 'd'].map((id, n) =>
      citaDePrueba({ id, nombreCorto: id, horaLocal: `0${n + 1}:00`, minutoPared: (n + 1) * 60, diaIndice: 1 }),
    );
    montar({ citas: cuatro });
    const botones = within(screen.getByRole('grid')).getAllByRole('button');
    expect(botones.length).toBeGreaterThan(42);
    for (const b of botones) {
      const clases = b.className.split(' ');
      // O bien 44 px siempre, o bien 44 px al tacto; y ningún `sm:min-h-*` que lo rebaje al tacto
      // (el compacto de escritorio va tras `pointer-fine:`).
      expect(clases.includes('min-h-11') || clases.includes('pointer-coarse:min-h-11')).toBe(true);
      expect(clases.filter((c) => /^sm:min-h-/.test(c))).toEqual([]);
    }
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
