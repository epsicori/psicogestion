import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarioAnio } from './calendario-anio';
import { construirVistaAnio } from './vista-anio';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => replace.mockClear());

const DIAS = [
  { dia: '2026-03-03', recuento: 7 },
  { dia: '2026-03-04', recuento: 1 },
  { dia: '2026-03-10', recuento: 14 },
  { dia: '2026-12-31', recuento: 3 },
];

function vistaDePrueba(dias = DIAS) {
  return construirVistaAnio({
    fecha: '2026-03-10',
    zona: 'Europe/Madrid',
    hoy: '2026-03-10',
    dias,
    profesionales: [
      { id: 'p1', nombre: 'Ana Ruiz' },
      { id: 'p2', nombre: 'Óscar Peña' },
    ],
  });
}

function montar(extra: Partial<Parameters<typeof CalendarioAnio>[0]> = {}) {
  return render(
    <CalendarioAnio
      vista={vistaDePrueba()}
      parametros={{ centro: 'c1', profesional: 'p2' }}
      centros={[
        { id: 'c1', nombre: 'Centro Norte' },
        { id: 'c2', nombre: 'Centro Sur' },
      ]}
      centroElegido="c1"
      rol="administrador"
      {...extra}
    />,
  );
}

function marzo() {
  return screen.getByRole('grid', { name: 'Marzo · 22 citas' });
}

describe('CalendarioAnio · estructura', () => {
  it('pinta el año, doce cuadrículas con su nombre y el mes con su total', () => {
    montar();
    expect(screen.getByRole('heading', { level: 2, name: '2026' })).toBeInTheDocument();
    expect(screen.getAllByRole('grid')).toHaveLength(12);
    expect(marzo()).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Enero · sin citas' })).toBeInTheDocument();
  });

  it('cada mes tiene la fila de cabeceras con el nombre largo para el lector', () => {
    montar();
    const cabeceras = within(marzo()).getAllByRole('columnheader');
    expect(cabeceras).toHaveLength(7);
    expect(cabeceras[2]).toHaveTextContent('X');
    expect(cabeceras[2]).toHaveTextContent('miércoles');
  });

  it('el día es un enlace con nombre accesible a su semana, conservando centro y profesional', () => {
    montar();
    const enlace = within(marzo()).getByRole('link', { name: 'martes, 3 de marzo de 2026, 7 citas' });
    expect(enlace).toHaveAttribute('href', '/agenda?vista=semana&fecha=2026-03-03&centro=c1&profesional=p2');
    expect(within(marzo()).getByRole('link', { name: 'jueves, 5 de marzo de 2026, sin citas' })).toBeInTheDocument();
  });

  it('el número y la barra van ocultos al lector: el nombre del enlace es el único texto', () => {
    montar();
    const enlace = within(marzo()).getByRole('link', { name: 'martes, 3 de marzo de 2026, 7 citas' });
    expect(enlace.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it('«hoy» lleva aria-current=date y solo ese día', () => {
    montar();
    const hoy = within(marzo()).getByRole('link', { name: /10 de marzo de 2026/ });
    expect(hoy).toHaveAttribute('aria-current', 'date');
    expect(document.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  });

  it('el día en foco es el único tabulable', () => {
    montar();
    const enlaces = screen.getAllByRole('link').filter((e) => e.hasAttribute('data-dia'));
    expect(enlaces).toHaveLength(365);
    expect(enlaces.filter((e) => e.tabIndex === 0).map((e) => e.getAttribute('data-dia'))).toEqual(['2026-03-10']);
  });
});

describe('CalendarioAnio · barra', () => {
  it('año anterior, siguiente y hoy conservan vista, centro y profesional', () => {
    montar();
    expect(screen.getByRole('link', { name: 'Año anterior' })).toHaveAttribute(
      'href',
      '/agenda?vista=anio&fecha=2025-03-10&centro=c1&profesional=p2',
    );
    expect(screen.getByRole('link', { name: 'Año siguiente' })).toHaveAttribute(
      'href',
      '/agenda?vista=anio&fecha=2027-03-10&centro=c1&profesional=p2',
    );
    expect(screen.getByRole('link', { name: 'Hoy' })).toHaveAttribute(
      'href',
      '/agenda?vista=anio&centro=c1&profesional=p2',
    );
  });

  it('el selector marca Año y lleva a Semana y Mes desde el día en foco', async () => {
    const user = userEvent.setup();
    montar();
    const grupo = screen.getByRole('group', { name: 'Vista del calendario' });
    expect(within(grupo).getByRole('link', { name: 'Año' })).toHaveAttribute('aria-current', 'page');
    expect(within(grupo).getByRole('link', { name: 'Mes' })).toHaveAttribute(
      'href',
      '/agenda?vista=mes&fecha=2026-03-10&centro=c1&profesional=p2',
    );
    // Mover el foco con el teclado cambia el día al que llevan los otros enlaces.
    within(marzo()).getByRole('link', { name: /10 de marzo/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(within(grupo).getByRole('link', { name: 'Mes' })).toHaveAttribute(
      'href',
      '/agenda?vista=mes&fecha=2026-03-11&centro=c1&profesional=p2',
    );
  });

  it('los filtros cambian la URL conservando el año visible', async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(screen.getByLabelText('Centro'), 'c2');
    expect(replace).toHaveBeenLastCalledWith(
      '/agenda?vista=anio&fecha=2026-03-10&centro=c2&profesional=p2',
      { scroll: false },
    );
    await user.selectOptions(screen.getByLabelText('Profesional'), 'p1');
    expect(replace).toHaveBeenLastCalledWith(
      '/agenda?vista=anio&fecha=2026-03-10&centro=c1&profesional=p1',
      { scroll: false },
    );
  });
});

describe('CalendarioAnio · teclado', () => {
  it('la flecha derecha mueve el foco al día siguiente y le da el tabulador', async () => {
    const user = userEvent.setup();
    montar();
    const origen = within(marzo()).getByRole('link', { name: /10 de marzo/ });
    origen.focus();
    await user.keyboard('{ArrowRight}');
    const destino = within(marzo()).getByRole('link', { name: /11 de marzo/ });
    expect(destino).toHaveFocus();
    expect(destino.tabIndex).toBe(0);
    expect(origen.tabIndex).toBe(-1);
  });

  it('la flecha abajo salta una semana, también hacia otro mes', async () => {
    const user = userEvent.setup();
    montar();
    within(marzo()).getByRole('link', { name: /10 de marzo/ }).focus();
    await user.keyboard('{ArrowDown}');
    expect(within(marzo()).getByRole('link', { name: /17 de marzo/ })).toHaveFocus();
  });

  it('la flecha abajo del 28 de marzo cae en el 4 de abril, otra cuadrícula', async () => {
    const user = userEvent.setup();
    montar();
    within(marzo()).getByRole('link', { name: /28 de marzo/ }).focus();
    await user.keyboard('{ArrowDown}');
    const abril = screen.getByRole('grid', { name: /Abril/ });
    expect(within(abril).getByRole('link', { name: /, 4 de abril/ })).toHaveFocus();
  });

  it('la flecha derecha del 31 de marzo pasa al 1 de abril, en la cuadrícula del mes siguiente', async () => {
    const user = userEvent.setup();
    montar();
    within(marzo()).getByRole('link', { name: /31 de marzo/ }).focus();
    await user.keyboard('{ArrowRight}');
    const abril = screen.getByRole('grid', { name: /Abril/ });
    const destino = within(abril).getByRole('link', { name: /, 1 de abril/ });
    expect(destino).toHaveFocus();
    expect(destino.tabIndex).toBe(0);
  });

  it('una tecla que no es de navegación no se intercepta; con Ctrl tampoco', () => {
    montar();
    const dia = within(marzo()).getByRole('link', { name: /10 de marzo/ });
    expect(fireEvent.keyDown(dia, { key: 'a' })).toBe(true);
    expect(fireEvent.keyDown(dia, { key: 'ArrowRight', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(dia, { key: 'ArrowRight' })).toBe(false);
  });

  it('en el tope del año el foco no se mueve', async () => {
    const user = userEvent.setup();
    montar({ vista: { ...vistaDePrueba(), fechaFoco: '2026-12-31' } });
    const ultimo = screen.getByRole('grid', { name: /Diciembre/ });
    const dia = within(ultimo).getByRole('link', { name: /31 de diciembre/ });
    dia.focus();
    await user.keyboard('{ArrowRight}');
    expect(dia).toHaveFocus();
    // Y el tabulador sigue en la rejilla: exactamente un día con tabindex=0, y es este.
    const tabulables = screen.getAllByRole('link').filter((a) => a.getAttribute('tabindex') === '0');
    expect(tabulables).toEqual([dia]);
  });
});

describe('CalendarioAnio · leyenda y año vacío', () => {
  it('con citas, la leyenda numérica está siempre visible', () => {
    montar();
    expect(screen.getByText('Citas por día, sin canceladas')).toBeInTheDocument();
    expect(screen.getByText('11–14')).toBeInTheDocument();
    expect(screen.queryByText('Leyenda')).toBeNull();
  });

  it('sin citas muestra el estado vacío y sigue pintando los doce meses', () => {
    montar({ vista: vistaDePrueba([]) });
    expect(screen.getByText('Sin citas en 2026')).toBeInTheDocument();
    expect(screen.queryByText('Citas por día, sin canceladas')).toBeNull();
    expect(screen.getAllByRole('grid')).toHaveLength(12);
  });
});
