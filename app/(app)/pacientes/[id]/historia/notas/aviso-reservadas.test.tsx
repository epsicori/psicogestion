import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AvisoReservadas } from './aviso-reservadas';
import { t } from '@/lib/i18n';

describe('AvisoReservadas', () => {
  // Verifica que se renderiza un único elemento ul con tres elementos de lista
  it('renderiza un ul con tres li', () => {
    render(<AvisoReservadas />);
    const listas = document.querySelectorAll('ul');
    expect(listas).toHaveLength(1);
    
    const items = listas[0].querySelectorAll('li');
    expect(items).toHaveLength(3);
  });

  // Verifica que los textos de las claves del catálogo aparecen en el orden correcto
  it('presenta los textos en el orden correcto del catálogo', () => {
    render(<AvisoReservadas />);
    const items = document.querySelectorAll('ul li');
    
    expect(items[0].textContent).toBe(t('notas.reservadas.excluye'));
    expect(items[1].textContent).toBe(t('notas.reservadas.noOculta'));
    expect(items[2].textContent).toBe(t('notas.reservadas.noOpone'));
  });

  // Verifica que el título del aviso está presente
  it('renderiza el título del aviso', () => {
    render(<AvisoReservadas />);
    const titulo = screen.getByText(t('notas.reservadas.titulo'));
    expect(titulo).toBeInTheDocument();
    expect(titulo).toHaveClass('font-medium');
  });
});
