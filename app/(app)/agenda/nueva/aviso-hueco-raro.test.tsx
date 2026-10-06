import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AvisoHuecoRaro } from './aviso-hueco-raro';

const ALTERNATIVAS = [
  { clave: '2026-10-06T11:00', texto: 'martes, 6 de octubre, 11:00', etiqueta: 'martes, 6 de octubre de 2026, 11:00, libre' },
  { clave: '2026-10-07T10:00', texto: 'miércoles, 7 de octubre, 10:00', etiqueta: 'miércoles, 7 de octubre de 2026, 10:00, libre' },
];

function pinta(extra: Partial<Parameters<typeof AvisoHuecoRaro>[0]> = {}) {
  const props = {
    minutos: 30,
    alternativas: ALTERNATIVAS,
    ocupado: false,
    alElegir: vi.fn(),
    alAgendarIgualmente: vi.fn(),
    ...extra,
  };
  return { ...render(<AvisoHuecoRaro {...props} />), props };
}

describe('AvisoHuecoRaro', () => {
  it('dice los minutos, se nombra por su título y no es una región viva ni un diálogo', () => {
    pinta();
    const region = screen.getByRole('region', { name: 'Esta cita deja un hueco corto' });
    expect(region).toHaveAccessibleDescription(/quedarían 30 minutos/);
    expect(region).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(region.querySelector('[aria-live]')).toBeNull();
  });

  it('el ref apunta a la sección, para poder darle el foco', () => {
    const ref = createRef<HTMLElement>();
    render(<AvisoHuecoRaro ref={ref} minutos={30} alternativas={[]} ocupado={false} alElegir={vi.fn()} alAgendarIgualmente={vi.fn()} />);
    expect(ref.current).toBe(screen.getByRole('region'));
  });

  it('cada alternativa es un botón con su texto y entrega clave y etiqueta', () => {
    const { props } = pinta();
    const lista = screen.getByRole('list', { name: 'Huecos que no lo dejan' });
    expect(lista.querySelectorAll('li')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'miércoles, 7 de octubre, 10:00' }));
    expect(props.alElegir).toHaveBeenCalledWith('2026-10-07T10:00', 'miércoles, 7 de octubre de 2026, 10:00, libre');
  });

  it('sin alternativas dice que no hay y no pinta la lista', () => {
    pinta({ alternativas: [] });
    expect(screen.getByText(/No hay otro hueco esta semana/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('«Agendar igualmente» avisa a quien lo usa', () => {
    const { props } = pinta();
    fireEvent.click(screen.getByRole('button', { name: 'Agendar igualmente' }));
    expect(props.alAgendarIgualmente).toHaveBeenCalledTimes(1);
  });

  it('ocupado: aria-disabled, nunca disabled (H27), y el clic no hace nada', () => {
    const { props } = pinta({ ocupado: true });
    const boton = screen.getByRole('button', { name: 'Agendar igualmente' });
    expect(boton).toHaveAttribute('aria-disabled', 'true');
    expect(boton).not.toBeDisabled();
    fireEvent.click(boton);
    expect(props.alAgendarIgualmente).not.toHaveBeenCalled();
    for (const b of screen.getAllByRole('button')) expect(b).not.toBeDisabled();
  });
});
