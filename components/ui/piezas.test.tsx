import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  AvisoDeError,
  BarraDeProgreso,
  Cargando,
  EstadoVacio,
  FilaConAvatar,
  Metrica,
  Pildora,
  Tarjeta,
} from './piezas';

// Estas piezas no tienen comportamiento, así que no llevan prueba de teclado. Lo que sí
// se comprueba es lo que un `div` con texto puede romper igual: que lo que anuncian al
// lector de pantalla esté ahí, y que el texto largo no desborde en silencio.

describe('Piezas de pintura', () => {
  it('la barra de progreso se anuncia con su valor y lo acota a 0–100', () => {
    render(<BarraDeProgreso etiqueta="Notas firmadas" valor={140} />);

    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '100');
    expect(barra).toHaveAttribute('aria-valuemin', '0');
    expect(barra).toHaveAttribute('aria-valuemax', '100');
  });

  it('la marca de carga se anuncia y no anima con movimiento reducido', () => {
    const { container } = render(<Cargando />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Cargando');
    const animado = container.querySelector('.animate-pulse');
    expect(animado?.className).toContain('motion-reduce:animate-none');
  });

  it('el error se anuncia como alerta', () => {
    render(<AvisoDeError mensaje="No se pudo guardar la nota." />);

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar la nota.');
  });

  it('la fila con avatar trunca el nombre largo en vez de desbordar', () => {
    render(
      <FilaConAvatar
        iniciales="LU"
        nombre="Lucía Fernández de la Torre y Martínez del Campo"
        subtitulo="Próxima cita: martes"
      />,
    );

    const nombre = screen.getByText(/Lucía Fernández/);
    expect(nombre.className).toContain('truncate');
  });

  it('la cifra de una métrica va en serif; el cuerpo de texto no', () => {
    render(<Metrica etiqueta="Pendientes" valor="12" matiz="esta semana" />);

    expect(screen.getByText('12').className).toContain('font-serif');
    expect(screen.getByText('esta semana').className).not.toContain('font-serif');
  });

  it('el estado vacío dice qué pasa y qué hacer', () => {
    render(<EstadoVacio frase="Sin citas hoy" explicacion="La agenda está libre." />);

    expect(screen.getByText('Sin citas hoy')).toBeInTheDocument();
    expect(screen.getByText('La agenda está libre.')).toBeInTheDocument();
  });

  it('la tarjeta y la píldora aceptan sus tres tonos y nada más', () => {
    render(
      <Tarjeta>
        <Pildora tono="success">Al día</Pildora>
        <Pildora tono="info">En curso</Pildora>
        <Pildora tono="warning">Pendiente</Pildora>
      </Tarjeta>,
    );

    expect(screen.getByText('Al día')).toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();

    // Un cuarto tono no compila. Queda escrito aquí porque es criterio del corte y el
    // compilador es quien lo hace cumplir:
    //   <Pildora tono="destructive">No</Pildora>
    //   → Type '"destructive"' is not assignable to type '"success" | "info" | "warning"'
  });
});
