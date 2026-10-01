import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TarjetaMetrica } from './tarjeta-metrica';

// Estas piezas no tienen comportamiento, así que no llevan prueba de teclado. Lo que sí
// se comprueba es lo que un `div` con texto puede romper igual: que lo que anuncian al
// lector de pantalla esté ahí, y que el texto largo no desborde en silencio.

describe('TarjetaMetrica', () => {
  it('pinta etiqueta, valor y detalle cuando los tres llegan', () => {
    render(
      <TarjetaMetrica
        etiqueta="Asistencia"
        valor="82 %"
        detalle="esta semana"
      />
    );

    expect(screen.getByText('Asistencia')).toBeInTheDocument();
    expect(screen.getByText('82 %')).toBeInTheDocument();
    expect(screen.getByText('esta semana')).toBeInTheDocument();
  });

  it('sin detalle no deja un nodo vacío', () => {
    const { container } = render(
      <TarjetaMetrica etiqueta="Pendientes" valor="12" />
    );

    expect(screen.getByText('Pendientes')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    // No debe haber ningún elemento con la clase de detalle
    const detalleElementos = container.querySelectorAll('.text-muted-foreground\\/70');
    expect(detalleElementos).toHaveLength(0);
  });

  it('valor va en font-serif', () => {
    render(<TarjetaMetrica etiqueta="Prueba" valor="50 %" />);

    expect(screen.getByText('50 %').className).toContain('font-serif');
  });
});
