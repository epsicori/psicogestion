import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PX_MIN } from './arrastre';
import { citaDePrueba, diasDePrueba } from './fixtures-cita';
import { RejillaSemana } from './rejilla-semana';

const eje = { desdeMinuto: 7 * 60, hastaMinuto: 21 * 60, horas: ['07:00', '08:00'] };

function montar(extra: Partial<React.ComponentProps<typeof RejillaSemana>> = {}) {
  const props = {
    titulo: '28 de septiembre – 4 de octubre de 2026',
    dias: diasDePrueba(),
    eje,
    citas: [citaDePrueba()],
    diaInicial: 1,
    alAbrirDia: vi.fn(),
    alAbrirCita: vi.fn(),
    alSoltar: vi.fn(),
    ...extra,
  };
  render(<RejillaSemana {...props} />);
  return props;
}

/** jsdom no tiene layout: se le da una caja a la fila de columnas (700 px de ancho desde x = 0). */
function darCaja() {
  const fila = screen.getByRole('row');
  vi.spyOn(fila, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 700,
    height: 1344,
    right: 700,
    bottom: 1344,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const cuerpo = fila.querySelector('[data-cuerpo]') as HTMLElement;
  vi.spyOn(cuerpo, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 40,
    width: 100,
    height: 1344,
    right: 100,
    bottom: 1384,
    x: 0,
    y: 40,
    toJSON: () => ({}),
  });
}

describe('RejillaSemana · estructura', () => {
  it('es una rejilla con el título como nombre, una fila y siete celdas', () => {
    montar();
    const rejilla = screen.getByRole('grid', { name: '28 de septiembre – 4 de octubre de 2026' });
    expect(within(rejilla).getAllByRole('row')).toHaveLength(1);
    expect(within(rejilla).getAllByRole('gridcell')).toHaveLength(7);
  });

  it('cada día tiene un botón con su nombre corto, su número y cuántas citas hay', () => {
    montar();
    expect(screen.getByRole('button', { name: /mar 29.*1 cita/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lun 28.*Sin citas/ })).toBeInTheDocument();
  });

  it('coloca la cita a su hora: 17:00 con el eje desde las 07:00 son 10 h * 96 px', () => {
    montar();
    const cita = screen.getByRole('button', { name: /Ana G\./ });
    expect(cita.style.top).toBe(`${(1020 - 7 * 60) * PX_MIN}px`);
    expect(cita.style.height).toBe(`${50 * PX_MIN}px`);
  });

  // Revisión TS H8: una cita de 15 minutos mide 24 px. Con ratón el alto dice la duración; al
  // tacto (`pointer: coarse`, una tableta a partir de md) el botón no baja de 44 px.
  it('las citas miden al menos 44 px de alto al tacto', () => {
    montar({ citas: [citaDePrueba({ duracionMinutos: 15 })] });
    const cita = screen.getByRole('button', { name: /Ana G\./ });
    expect(cita.className.split(' ')).toContain('pointer-coarse:min-h-(--alto-tactil)');
    expect(cita.style.getPropertyValue('--alto-tactil')).toBe('44px');
  });

  // Revisión de cierre N3: crecer a 44 px no puede tapar a la cita que viene justo después.
  describe('alto táctil con otra cita debajo', () => {
    const seguidas = (huecoMin: number) => [
      citaDePrueba({ id: 'a', nombreCorto: 'Aa', minutoPared: 600, duracionMinutos: 15 }),
      citaDePrueba({ id: 'b', nombreCorto: 'Bb', minutoPared: 615 + huecoMin, duracionMinutos: 15 }),
    ];
    const altoTactil = (nombre: RegExp) =>
      screen.getByRole('button', { name: nombre }).style.getPropertyValue('--alto-tactil');

    it('la que acaba donde empieza la siguiente no crece más allá de ella (24 px)', () => {
      montar({ citas: seguidas(0) });
      expect(altoTactil(/Aa/)).toBe(`${15 * PX_MIN}px`);
      expect(altoTactil(/Bb/)).toBe('44px');
    });

    it('gemela: con un hueco de 15 minutos hasta la siguiente crece hasta donde cabe, sin pasarse de 44', () => {
      montar({ citas: seguidas(15) });
      expect(altoTactil(/Aa/)).toBe('44px');
    });

    it('gemela: una cita en OTRA columna del grupo no limita el crecimiento', () => {
      montar({
        citas: [
          citaDePrueba({ id: 'a', nombreCorto: 'Aa', minutoPared: 600, duracionMinutos: 15, columna: 0, columnasEnGrupo: 2 }),
          citaDePrueba({ id: 'b', nombreCorto: 'Bb', minutoPared: 600, duracionMinutos: 60, columna: 1, columnasEnGrupo: 2 }),
        ],
      });
      expect(altoTactil(/Aa/)).toBe('44px');
    });
  });

  it('las citas de un mismo grupo se reparten el ancho de la columna', () => {
    montar({
      citas: [
        citaDePrueba({ id: 'a', nombreCorto: 'Aa', columna: 0, columnasEnGrupo: 2 }),
        citaDePrueba({ id: 'b', nombreCorto: 'Bb', columna: 1, columnasEnGrupo: 2 }),
      ],
    });
    expect(screen.getByRole('button', { name: /Aa/ }).style.left).toBe('0%');
    expect(screen.getByRole('button', { name: /Bb/ }).style.left).toBe('50%');
    expect(screen.getByRole('button', { name: /Bb/ }).style.width).toBe('50%');
  });
});

describe('RejillaSemana · teclado', () => {
  it('solo el día activo se alcanza con Tab; las flechas mueven el foco y Fin va al domingo', async () => {
    const user = userEvent.setup();
    montar();
    const dias = screen.getAllByRole('button', { name: /^(lun|mar|mié|jue|vie|sáb|dom) / });
    expect(dias.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(dias[1].tabIndex).toBe(0);

    dias[1].focus();
    await user.keyboard('{ArrowRight}');
    expect(dias[2]).toHaveFocus();
    await user.keyboard('{End}');
    expect(dias[6]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(dias[6]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(dias[0]).toHaveFocus();
  });

  it('Intro sobre el día abre el panel del día, con el botón como ancla', async () => {
    const user = userEvent.setup();
    const props = montar();
    const dia = screen.getByRole('button', { name: /mar 29/ });
    dia.focus();
    await user.keyboard('{Enter}');
    expect(props.alAbrirDia).toHaveBeenCalledWith(expect.objectContaining({ fecha: '2026-09-29' }), dia);
  });

  it('una cita solo se alcanza con Tab en el día activo', () => {
    montar({
      citas: [
        citaDePrueba({ id: 'a', nombreCorto: 'Aa', diaIndice: 1 }),
        citaDePrueba({ id: 'b', nombreCorto: 'Bb', diaIndice: 3, fechaLocal: '2026-10-01' }),
      ],
    });
    expect(screen.getByRole('button', { name: /Aa/ }).tabIndex).toBe(0);
    expect(screen.getByRole('button', { name: /Bb/ }).tabIndex).toBe(-1);
  });

  it('Escape sobre una cita devuelve el foco al número de su día', async () => {
    const user = userEvent.setup();
    montar();
    const cita = screen.getByRole('button', { name: /Ana G\./ });
    cita.focus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /mar 29/ })).toHaveFocus();
  });

  it('Intro sobre una cita la abre con la cita como ancla', async () => {
    const user = userEvent.setup();
    const props = montar();
    const cita = screen.getByRole('button', { name: /Ana G\./ });
    cita.focus();
    await user.keyboard('{Enter}');
    expect(props.alAbrirCita).toHaveBeenCalledWith(expect.objectContaining({ id: citaDePrueba().id }), cita);
  });

  it('un clic en el hueco de la columna abre el día', () => {
    const props = montar();
    const hueco = screen.getAllByRole('gridcell')[2].querySelector('[data-cuerpo]') as HTMLElement;
    fireEvent.click(hueco);
    expect(props.alAbrirDia).toHaveBeenCalledWith(
      expect.objectContaining({ fecha: '2026-09-30' }),
      screen.getByRole('button', { name: /mié 30/ }),
    );
  });
});

describe('RejillaSemana · arrastrar', () => {
  // Cita de las 17:00 (minuto 1020) el martes, columna 1 (x de 100 a 200). Ojo: el cuerpo empieza
  // en top = 40, así que el minuto 1020 está a y = 40 + 780 * PX_MIN.
  const yCita = 40 + (1020 - 7 * 60) * PX_MIN;

  function arrastrar(cita: HTMLElement, hasta: { x: number; y: number }) {
    fireEvent.pointerDown(cita, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 150, clientY: yCita + 10 });
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: hasta.x, clientY: hasta.y });
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: hasta.x, clientY: hasta.y });
  }

  it('soltar en otra columna y hora avisa con la fecha de la columna y la hora ajustada a cuartos', () => {
    const props = montar();
    darCaja();
    const cita = screen.getByRole('button', { name: /Ana G\./ });
    // Miércoles (x 200-300), tres horas antes: 14:00 más el agarre de 10 px.
    arrastrar(cita, { x: 250, y: yCita + 10 - 3 * 96 });
    expect(props.alSoltar).toHaveBeenCalledWith(expect.objectContaining({ id: citaDePrueba().id }), '2026-09-30', '14:00');
  });

  // Revisión TS H10: el diálogo devuelve el foco a lo que lo tenía al abrirse. Un pointerdown
  // sobre un botón no lo enfoca en todos los navegadores (Safari, ni aquí): sin enfocar la cita
  // antes de avisar, al cerrar el diálogo el foco cae a `body`.
  it('al soltar, la cita arrastrada tiene el foco cuando se pide el diálogo', () => {
    let enFocoAlSoltar: Element | null = null;
    montar({ alSoltar: vi.fn(() => (enFocoAlSoltar = document.activeElement)) });
    darCaja();
    const cita = screen.getByRole('button', { name: /Ana G\./ });
    expect(document.activeElement).toBe(document.body);
    arrastrar(cita, { x: 250, y: yCita + 10 - 3 * 96 });
    expect(enFocoAlSoltar).toBe(cita);
  });

  it('un movimiento menor que el umbral no es un arrastre', () => {
    const props = montar();
    darCaja();
    const cita = screen.getByRole('button', { name: /Ana G\./ });
    arrastrar(cita, { x: 152, y: yCita + 12 });
    expect(props.alSoltar).not.toHaveBeenCalled();
  });

  it('soltar donde estaba no pide nada', () => {
    const alSoltar = vi.fn();
    montar({ alSoltar });
    darCaja();
    const cita = screen.getByRole('button', { name: /Ana G\./ });
    arrastrar(cita, { x: 150, y: yCita + 10 + 30 });
    // 30 px son 18,75 minutos: se ajusta a 17:15, que no es donde estaba. Se vuelve a 17:00:
    expect(alSoltar).toHaveBeenCalledTimes(1);
    alSoltar.mockClear();
    arrastrar(cita, { x: 150, y: yCita + 10 + 8 });
    expect(alSoltar).not.toHaveBeenCalled();
  });

  it('Escape durante el arrastre lo cancela', () => {
    const props = montar();
    darCaja();
    const cita = screen.getByRole('button', { name: /Ana G\./ });
    fireEvent.pointerDown(cita, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 150, clientY: yCita + 10 });
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: 250, clientY: yCita + 10 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: 250, clientY: yCita + 10 });
    expect(props.alSoltar).not.toHaveBeenCalled();
  });

  it('el tacto no arrastra', () => {
    const props = montar();
    darCaja();
    const cita = screen.getByRole('button', { name: /Ana G\./ });
    fireEvent.pointerDown(cita, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 150, clientY: yCita + 10 });
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'touch', clientX: 250, clientY: yCita + 10 });
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'touch', clientX: 250, clientY: yCita + 10 });
    expect(props.alSoltar).not.toHaveBeenCalled();
  });

  it('una cita que no se puede reprogramar no se arrastra', () => {
    const props = montar({ citas: [citaDePrueba({ reprogramable: false })] });
    darCaja();
    arrastrar(screen.getByRole('button', { name: /Ana G\./ }), { x: 250, y: yCita + 10 });
    expect(props.alSoltar).not.toHaveBeenCalled();
  });

  it('tras arrastrar, el clic que suelta el puntero no abre el panel de la cita', () => {
    const props = montar();
    darCaja();
    const cita = screen.getByRole('button', { name: /Ana G\./ });
    arrastrar(cita, { x: 250, y: yCita + 10 });
    fireEvent.click(cita);
    expect(props.alAbrirCita).not.toHaveBeenCalled();
    // y el siguiente clic, ya sin arrastre, sí.
    fireEvent.click(cita);
    expect(props.alAbrirCita).toHaveBeenCalledTimes(1);
  });
});
