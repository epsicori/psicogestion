import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const { SelectorProfesional } = await import('./selector-profesional');

const LAURA = '1b2c3d4e-5f60-4a71-8b82-9c0d1e2f3a40';
const OPCIONES = [{ id: LAURA, nombre: 'Laura Gil' }];

beforeEach(() => replace.mockReset());

describe('SelectorProfesional', () => {
  it('elegir un profesional pone su uuid en la URL', () => {
    render(<SelectorProfesional opciones={OPCIONES} elegido={null} />);
    const combo = screen.getByRole('combobox', { name: t('cobros.profesional') });
    expect(combo).toHaveTextContent(t('cobros.todosLosProfesionales'));
    fireEvent.click(combo);
    fireEvent.click(screen.getByRole('option', { name: 'Laura Gil' }));
    expect(replace).toHaveBeenCalledWith(`/facturacion?profesional=${LAURA}`, { scroll: false });
  });

  it('«Todos los profesionales» quita el parámetro', () => {
    render(<SelectorProfesional opciones={OPCIONES} elegido={LAURA} />);
    fireEvent.click(screen.getByRole('combobox', { name: t('cobros.profesional') }));
    fireEvent.click(screen.getByRole('option', { name: t('cobros.todosLosProfesionales') }));
    expect(replace).toHaveBeenCalledWith('/facturacion', { scroll: false });
  });
});
