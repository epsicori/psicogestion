import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BarraDeAcciones } from './barra-de-acciones';

const base = {
  puedeGuardar: false,
  puedeFirmar: false,
  puedeModificar: false,
  pendiente: false,
  alGuardar: vi.fn(),
  alFirmar: vi.fn(),
  alModificar: vi.fn(),
};

describe('BarraDeAcciones', () => {
  it('es una barra de herramientas con nombre', () => {
    render(<BarraDeAcciones {...base} />);
    expect(screen.getByRole('toolbar', { name: 'Acciones de la nota' })).toBeInTheDocument();
  });

  it('con los tres en false no hay ningún botón', () => {
    render(<BarraDeAcciones {...base} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('solo pinta lo que es true, y cada botón llama a lo suyo', () => {
    const alGuardar = vi.fn();
    const alFirmar = vi.fn();
    const alModificar = vi.fn();
    render(
      <BarraDeAcciones
        {...base}
        puedeGuardar
        puedeFirmar
        alGuardar={alGuardar}
        alFirmar={alFirmar}
        alModificar={alModificar}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Modificar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Firmar' }));
    expect(alGuardar).toHaveBeenCalledTimes(1);
    expect(alFirmar).toHaveBeenCalledTimes(1);
    expect(alModificar).not.toHaveBeenCalled();
  });

  it('Modificar aparece solo con puedeModificar', () => {
    const alModificar = vi.fn();
    render(<BarraDeAcciones {...base} puedeModificar alModificar={alModificar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modificar' }));
    expect(alModificar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Firmar' })).toBeNull();
  });

  it('con pendiente, Firmar y Guardar quedan desactivados', () => {
    render(<BarraDeAcciones {...base} puedeGuardar puedeFirmar pendiente />);
    expect(screen.getByRole('button', { name: 'Firmar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('sin pendiente, los botones están activos', () => {
    render(<BarraDeAcciones {...base} puedeGuardar puedeFirmar />);
    expect(screen.getByRole('button', { name: 'Firmar' })).toBeEnabled();
  });

  it('no lleva Comparar ni Descargar (llegan con el corte C)', () => {
    render(<BarraDeAcciones {...base} puedeGuardar puedeFirmar puedeModificar />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
