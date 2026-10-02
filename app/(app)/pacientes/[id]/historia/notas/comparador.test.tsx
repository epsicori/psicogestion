import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { VersionDeVista } from '@/lib/notas/servidor';

import { Comparador } from './comparador';

function version(numero: number, extra: Partial<VersionDeVista> = {}): VersionDeVista {
  return {
    numero,
    autor: 'Ana Pérez',
    firmadaEn: '1 oct 2026, 10:00',
    motivo: numero > 1 ? 'Corrección' : null,
    alcance: 'individual',
    texto: `Texto ${numero}`,
    reservadas: null,
    sello: 'Escrita durante la sesión',
    enSesion: true,
    margen: null,
    huellaCorta: 'abcdef012345',
    ...extra,
  };
}

const V1 = version(1, { texto: 'El paciente refiere ansiedad leve.' });
const V2 = version(2, { texto: 'El paciente refiere ansiedad moderada y insomnio.' });

/** El texto que llega al lector de pantalla: todo menos lo que lleva `aria-hidden`. */
function textoAccesible(nodo: Node): string {
  if (nodo.nodeType === Node.TEXT_NODE) return nodo.textContent ?? '';
  if (nodo instanceof Element && nodo.getAttribute('aria-hidden') === 'true') return '';
  return Array.from(nodo.childNodes).map(textoAccesible).join('');
}

/** El texto que se ve: todo menos lo `sr-only`. */
function textoVisible(nodo: Node): string {
  if (nodo.nodeType === Node.TEXT_NODE) return nodo.textContent ?? '';
  if (nodo instanceof Element && nodo.classList.contains('sr-only')) return '';
  return Array.from(nodo.childNodes).map(textoVisible).join('');
}

function abrir() {
  fireEvent.click(screen.getByRole('button', { name: 'Comparar versiones' }));
}

function elegir(desplegable: 'Desde' | 'Hasta', opcion: string) {
  fireEvent.click(screen.getByRole('combobox', { name: desplegable }));
  fireEvent.click(screen.getByRole('option', { name: opcion }));
}

function region() {
  return screen.getByRole('region');
}

describe('Comparador', () => {
  it('con una sola versión no hay control de comparar', () => {
    const { container } = render(<Comparador versiones={[V1]} />);
    expect(screen.queryByRole('button', { name: 'Comparar versiones' })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('gemela: con dos versiones sí lo hay, cerrado', () => {
    render(<Comparador versiones={[V1, V2]} />);
    const boton = screen.getByRole('button', { name: 'Comparar versiones' });
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('al abrir: aria-expanded, aria-controls hacia la región y el título por defecto (penúltima → vigente)', () => {
    render(<Comparador versiones={[V1, V2]} />);
    abrir();
    const boton = screen.getByRole('button', { name: 'Comparar versiones' });
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    expect(boton.getAttribute('aria-controls')).toBe(region().id);
    expect(region()).toHaveAccessibleName('De la versión 1 a la 2');
    expect(within(region()).getByRole('heading', { level: 3 })).toHaveTextContent('De la versión 1 a la 2');
    // El foco se queda en el botón.
    boton.focus();
    abrir();
    expect(document.activeElement).toBe(boton);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('con tres versiones, por defecto desde la penúltima hasta la vigente', () => {
    render(<Comparador versiones={[V1, V2, version(3, { texto: 'Otro' })]} />);
    abrir();
    expect(region()).toHaveAccessibleName('De la versión 2 a la 3');
    expect(screen.getByRole('combobox', { name: 'Desde' })).toHaveTextContent('Versión 2');
    expect(screen.getByRole('combobox', { name: 'Hasta' })).toHaveTextContent('Versión 3');
  });

  it('lo añadido: ins subrayado, «+» visible y «Añadido: … Fin del cambio.» para el lector', () => {
    render(<Comparador versiones={[V1, V2]} />);
    abrir();
    const ins = region().querySelector('ins');
    expect(ins).not.toBeNull();
    expect(ins!.textContent).toContain('moderada');
    expect(ins!.className).toContain('underline');
    expect(ins!.className).toContain('decoration-2');
    expect(textoVisible(ins!)).toBe('+moderada y insomnio.');
    expect(textoAccesible(ins!)).toBe('Añadido: moderada y insomnio. Fin del cambio.');
  });

  it('lo retirado: del tachado, «−» visible y «Retirado: …» para el lector', () => {
    render(<Comparador versiones={[V1, V2]} />);
    abrir();
    const del = region().querySelector('del');
    expect(del).not.toBeNull();
    expect(del!.className).toContain('line-through');
    expect(textoVisible(del!)).toBe('−leve.');
    expect(textoAccesible(del!)).toBe('Retirado: leve. Fin del cambio.');
  });

  it('lo igual va sin marca, en un párrafo que respeta los saltos de línea', () => {
    render(<Comparador versiones={[V1, V2]} />);
    abrir();
    const parrafo = region().querySelector('ins')!.parentElement!;
    expect(parrafo.tagName).toBe('P');
    expect(parrafo.className).toContain('whitespace-pre-wrap');
    expect(textoVisible(parrafo)).toBe('El paciente refiere ansiedad −leve.+moderada y insomnio.');
  });

  it('la leyenda está a la vista', () => {
    render(<Comparador versiones={[V1, V2]} />);
    abrir();
    expect(
      within(region()).getByText('Lo añadido va subrayado y con «+»; lo retirado, tachado y con «−».'),
    ).toBeInTheDocument();
  });

  it('orden invertido (desde la 2, hasta la 1): se compara igual de la menor a la mayor', () => {
    render(<Comparador versiones={[V1, V2]} />);
    abrir();
    elegir('Desde', 'Versión 2');
    elegir('Hasta', 'Versión 1');
    expect(screen.getByRole('combobox', { name: 'Desde' })).toHaveTextContent('Versión 2');
    expect(region()).toHaveAccessibleName('De la versión 1 a la 2');
    expect(region().querySelector('ins')!.textContent).toContain('moderada');
    expect(region().querySelector('del')!.textContent).toContain('leve.');
  });

  describe('C1-H2 · otro par que el de partida, con tres versiones', () => {
    const T1 = version(1, { texto: 'Ánimo leve.', reservadas: 'Reserva uno' });
    const T2 = version(2, { texto: 'Ánimo moderado.', reservadas: 'Reserva dos' });
    const T3 = version(3, { texto: 'Ánimo grave.', reservadas: 'Reserva tres' });

    function bloque(nombre: 'Nota' | 'Anotaciones reservadas') {
      return within(region()).getByRole('heading', { name: nombre }).parentElement!;
    }

    function cambios(nombre: 'Nota' | 'Anotaciones reservadas') {
      const b = bloque(nombre);
      return {
        retirado: Array.from(b.querySelectorAll('del')).map((d) => textoVisible(d)).join('|'),
        anadido: Array.from(b.querySelectorAll('ins')).map((d) => textoVisible(d)).join('|'),
      };
    }

    it('por defecto, de la 2 a la 3', () => {
      render(<Comparador versiones={[T1, T2, T3]} />);
      abrir();
      expect(cambios('Nota')).toEqual({ retirado: '−moderado.', anadido: '+grave.' });
      expect(cambios('Anotaciones reservadas')).toEqual({ retirado: '−dos', anadido: '+tres' });
    });

    it('«Desde: Versión 1» compara la 1 con la 3, en la nota y en las reservadas', () => {
      render(<Comparador versiones={[T1, T2, T3]} />);
      abrir();
      elegir('Desde', 'Versión 1');
      expect(region()).toHaveAccessibleName('De la versión 1 a la 3');
      expect(cambios('Nota')).toEqual({ retirado: '−leve.', anadido: '+grave.' });
      expect(cambios('Anotaciones reservadas')).toEqual({ retirado: '−uno', anadido: '+tres' });
    });

    it('«Desde: Versión 1» y «Hasta: Versión 2» compara la 1 con la 2, no con la vigente', () => {
      render(<Comparador versiones={[T1, T2, T3]} />);
      abrir();
      elegir('Desde', 'Versión 1');
      elegir('Hasta', 'Versión 2');
      expect(region()).toHaveAccessibleName('De la versión 1 a la 2');
      expect(cambios('Nota')).toEqual({ retirado: '−leve.', anadido: '+moderado.' });
      expect(cambios('Anotaciones reservadas')).toEqual({ retirado: '−uno', anadido: '+dos' });
    });
  });

  it('reservadas: sin bloque si las dos están vacías', () => {
    render(<Comparador versiones={[V1, { ...V2, reservadas: '' }]} />);
    abrir();
    expect(within(region()).queryByRole('heading', { name: 'Anotaciones reservadas' })).toBeNull();
    expect(within(region()).queryByText('Anotaciones reservadas (art. 18.3, Ley 41/2002)')).toBeNull();
    expect(within(region()).getByRole('heading', { name: 'Nota' })).toBeInTheDocument();
  });

  it('gemela: con reservadas en una, el bloque sale con su aviso y su comparación', () => {
    render(<Comparador versiones={[V1, { ...V2, reservadas: 'Hipótesis de trabajo' }]} />);
    abrir();
    const titulo = within(region()).getByRole('heading', { name: 'Anotaciones reservadas' });
    const bloque = titulo.parentElement!;
    expect(within(bloque).getByText('Anotaciones reservadas (art. 18.3, Ley 41/2002)')).toBeInTheDocument();
    expect(textoAccesible(bloque.querySelector('ins')!)).toBe('Añadido: Hipótesis de trabajo Fin del cambio.');
  });

  it('iguales: «Sin cambios entre estas dos versiones.» como estado', () => {
    render(<Comparador versiones={[V1, { ...V2, texto: V1.texto }]} />);
    abrir();
    expect(screen.getByRole('status')).toHaveTextContent('Sin cambios entre estas dos versiones.');
    expect(region().querySelector('ins, del')).toBeNull();
  });

  it('C1-H1 · mismo texto y reservadas distintas: no dice «Sin cambios» y el bloque de reservadas lo enseña', () => {
    render(<Comparador versiones={[V1, { ...V2, texto: V1.texto, reservadas: 'Hipótesis de trabajo' }]} />);
    abrir();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Sin cambios entre estas dos versiones.')).toBeNull();
    expect(region().querySelector('ins')!.textContent).toContain('Hipótesis de trabajo');
  });

  it('gemela: con cambios no hay «Sin cambios»', () => {
    render(<Comparador versiones={[V1, V2]} />);
    abrir();
    expect(screen.queryByText('Sin cambios entre estas dos versiones.')).toBeNull();
  });

  it('comparación resumida: si se agota el presupuesto, la pantalla lo dice', () => {
    const antes = 'A ' + Array.from({ length: 3000 }, (_, i) => `x${i}`).join(' ');
    const despues = 'A ' + Array.from({ length: 3000 }, (_, i) => `y${i}`).join(' ');
    render(<Comparador versiones={[{ ...V1, texto: antes }, { ...V2, texto: despues }]} />);
    abrir();
    expect(
      within(region()).getByText(
        'Hay demasiados cambios para señalarlos palabra a palabra: se muestra completo lo retirado y lo añadido.',
      ),
    ).toBeInTheDocument();
  });

  it('gemela: con un diff completo no sale la línea de resumida', () => {
    render(<Comparador versiones={[V1, V2]} />);
    abrir();
    expect(screen.queryByText(/Hay demasiados cambios/)).toBeNull();
  });

  it('números posicionales: las opciones son los números del modelo, no otros', () => {
    // En lectura conjunta las reales serían la 2 y la 3; el modelo ya las numera 1 y 2 (B1-H4).
    render(<Comparador versiones={[V1, V2]} />);
    abrir();
    fireEvent.click(screen.getByRole('combobox', { name: 'Desde' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Versión 1', 'Versión 2']);
  });

  it('no muestra ningún motivo de cambio', () => {
    render(<Comparador versiones={[V1, { ...V2, motivo: 'Ajuste confidencial' }]} />);
    abrir();
    expect(screen.queryByText(/Ajuste confidencial/)).toBeNull();
  });
});
