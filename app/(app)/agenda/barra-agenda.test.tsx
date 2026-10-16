import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FiltrosAgenda, SelectorVista } from './barra-agenda';
import type { Vista } from './parametros';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => replace.mockClear());

describe('SelectorVista', () => {
  const hrefDe = (v: Vista) => `/agenda?vista=${v}&fecha=2026-03-10`;

  it('ofrece Semana, Mes y Año como enlaces y marca solo el actual', () => {
    render(<SelectorVista actual="anio" hrefDe={hrefDe} />);
    const grupo = screen.getByRole('group', { name: 'Vista del calendario' });
    const enlaces = within(grupo).getAllByRole('link');
    expect(enlaces.map((e) => e.textContent)).toEqual(['Semana', 'Mes', 'Año']);
    expect(within(grupo).getByRole('link', { name: 'Año' })).toHaveAttribute('aria-current', 'page');
    expect(within(grupo).getByRole('link', { name: 'Mes' })).not.toHaveAttribute('aria-current');
    expect(within(grupo).getByRole('link', { name: 'Semana' })).toHaveAttribute(
      'href',
      '/agenda?vista=semana&fecha=2026-03-10',
    );
  });
});

describe('FiltrosAgenda', () => {
  const centros = [
    { id: 'c1', nombre: 'Centro Norte' },
    { id: 'c2', nombre: 'Centro Sur' },
  ];
  const profesionales = [
    { id: 'p1', nombre: 'Ana Ruiz' },
    { id: 'p2', nombre: 'Óscar Peña' },
  ];
  const hrefCon = (c: { centro?: string | null; profesional?: string | null }) =>
    `/agenda?centro=${c.centro ?? ''}&profesional=${c.profesional ?? ''}`;

  function montar(extra: Partial<Parameters<typeof FiltrosAgenda>[0]> = {}) {
    return render(
      <FiltrosAgenda
        centros={centros}
        centroElegido="todos"
        rol="administrador"
        profesionales={profesionales}
        profesionalElegido={null}
        hrefCon={hrefCon}
        {...extra}
      />,
    );
  }

  it('elegir un centro o un profesional reemplaza la URL sin saltar al inicio', async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(screen.getByLabelText('Centro'), 'c2');
    expect(replace).toHaveBeenLastCalledWith('/agenda?centro=c2&profesional=', { scroll: false });
    await user.selectOptions(screen.getByLabelText('Centro'), '');
    expect(replace).toHaveBeenLastCalledWith('/agenda?centro=todos&profesional=', { scroll: false });
    await user.selectOptions(screen.getByLabelText('Profesional'), 'p2');
    expect(replace).toHaveBeenLastCalledWith('/agenda?centro=&profesional=p2', { scroll: false });
  });

  it('el centro solo se ofrece con dos o más; el profesional, no a un profesional sanitario ni con menos de dos', () => {
    const a = montar({ centros: [centros[0]] });
    expect(screen.queryByLabelText('Centro')).toBeNull();
    a.unmount();
    const b = montar({ rol: 'profesional_sanitario' });
    expect(screen.queryByLabelText('Profesional')).toBeNull();
    b.unmount();
    montar({ profesionales: [profesionales[0]] });
    expect(screen.queryByLabelText('Profesional')).toBeNull();
  });
});
