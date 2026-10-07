import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

// next/link como un <a>: aquí se prueba el foco, no el enrutado.
vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

type Modulo = typeof import('./paginacion-pendientes');
let PaginacionPendientes: Modulo['PaginacionPendientes'];

beforeEach(async () => {
  // La marca de clic vive en el módulo: cada prueba parte de un módulo nuevo.
  vi.resetModules();
  ({ PaginacionPendientes } = await import('./paginacion-pendientes'));
});

const pintarPagina = (pagina: number) => (
  <PaginacionPendientes
    pagina={pagina}
    rango={`rango de la página ${pagina}`}
    anterior={pagina > 1 ? `/facturacion?pagina=${pagina - 1}` : null}
    siguiente={pagina < 3 ? `/facturacion?pagina=${pagina + 1}` : null}
  />
);

describe('PaginacionPendientes (B-H6)', () => {
  it('pinta la navegación con el rango y los enlaces que se le dan', () => {
    render(pintarPagina(2));
    expect(screen.getByRole('navigation', { name: t('cobros.paginacion.nombre') })).toBeInTheDocument();
    expect(screen.getByText('rango de la página 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('cobros.paginacion.anteriores') })).toHaveAttribute(
      'href',
      '/facturacion?pagina=1',
    );
    expect(screen.getByRole('link', { name: t('cobros.paginacion.siguientes') })).toHaveAttribute(
      'href',
      '/facturacion?pagina=3',
    );
  });

  it('clic en «Siguientes» y nueva página: el foco va al rango', () => {
    const { rerender } = render(pintarPagina(1));
    fireEvent.click(screen.getByRole('link', { name: t('cobros.paginacion.siguientes') }));
    rerender(pintarPagina(2));
    expect(document.activeElement).toBe(screen.getByText('rango de la página 2'));
    expect(document.activeElement).toHaveAttribute('tabindex', '-1');
  });

  it('clic en «Anteriores» y nueva página: el foco va al rango', () => {
    const { rerender } = render(pintarPagina(3));
    fireEvent.click(screen.getByRole('link', { name: t('cobros.paginacion.anteriores') }));
    rerender(pintarPagina(2));
    expect(document.activeElement).toBe(screen.getByText('rango de la página 2'));
  });

  it('con clic y la navegación desmontada y montada de nuevo, el foco también va al rango', () => {
    const { unmount } = render(pintarPagina(1));
    fireEvent.click(screen.getByRole('link', { name: t('cobros.paginacion.siguientes') }));
    unmount();
    render(pintarPagina(2));
    expect(document.activeElement).toBe(screen.getByText('rango de la página 2'));
  });

  it('el foco se mueve una sola vez por clic', () => {
    const { rerender } = render(pintarPagina(1));
    fireEvent.click(screen.getByRole('link', { name: t('cobros.paginacion.siguientes') }));
    rerender(pintarPagina(2));
    (document.activeElement as HTMLElement).blur();
    rerender(pintarPagina(3));
    expect(document.activeElement).toBe(document.body);
  });

  it('montar sin clic previo no mueve el foco', () => {
    render(pintarPagina(2));
    expect(document.activeElement).toBe(document.body);
  });

  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])(
    'R4.5: un clic con %s no enciende la marca: aunque llegue la página 3, el foco no se mueve',
    (modificador) => {
      const { rerender } = render(pintarPagina(2));
      fireEvent.click(screen.getByRole('link', { name: t('cobros.paginacion.siguientes') }), { [modificador]: true });
      rerender(pintarPagina(3));
      expect(document.activeElement).toBe(document.body);
    },
  );

  it('R4.5: un clic con otro botón del ratón no enciende la marca', () => {
    const { rerender } = render(pintarPagina(2));
    fireEvent.click(screen.getByRole('link', { name: t('cobros.paginacion.siguientes') }), { button: 1 });
    rerender(pintarPagina(3));
    expect(document.activeElement).toBe(document.body);
  });

  it('R4.5: navegación sustituida: se pide la 3 y llega la 1, el foco no se mueve; después la 3 tampoco', () => {
    const { rerender } = render(pintarPagina(2));
    fireEvent.click(screen.getByRole('link', { name: t('cobros.paginacion.siguientes') }));
    rerender(pintarPagina(1));
    expect(document.activeElement).toBe(document.body);
    rerender(pintarPagina(3));
    expect(document.activeElement).toBe(document.body);
  });
});
