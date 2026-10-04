import Link from 'next/link';
import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/citas/agenda', () => ({ leerCitasRango: vi.fn() }));
vi.mock('@/lib/citas/propuestas', () => ({ listarPropuestasPendientes: vi.fn() }));
vi.mock('./acciones', () => ({}));
vi.mock('./calendario', () => ({ Calendario: () => null }));
vi.mock('./cuadro', () => ({ Cuadro: () => null }));
vi.mock('./datos', () => ({ cargarContexto: vi.fn() }));
vi.mock('./documentacion', () => ({ Documentacion: () => null }));
vi.mock('./por-confirmar', () => ({ PorConfirmar: () => null }));
vi.mock('./proximas', () => ({ Proximas: () => null }));

import { Documentacion } from './documentacion';
import PaginaAgenda from './page';
import { PorConfirmar } from './por-confirmar';
import { Proximas } from './proximas';

/** Los tipos de componente que aparecen en el árbol, en orden de documento. */
function tiposEnOrden(nodo: ReactNode, salida: unknown[] = []): unknown[] {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) tiposEnOrden(hijo, salida);
  } else if (isValidElement<{ children?: ReactNode }>(nodo)) {
    salida.push(nodo.type);
    tiposEnOrden(nodo.props.children, salida);
  }
  return salida;
}

describe('PaginaAgenda', () => {
  // docs/interfaz.md §Agenda y diseno.md §1.6.1: «Citas próximas», «Por confirmar» y «Documentación».
  it('la columna lateral va en el orden: próximas, por confirmar, documentación', async () => {
    // La página es un `<Suspense>` que envuelve a `Cuerpo`, un componente async: se invoca a mano.
    const pagina = PaginaAgenda({ searchParams: Promise.resolve({}) });
    const cuerpo = tiposEnOrden(pagina).find((tipo) => typeof tipo === 'function' && tipo.name === 'Cuerpo') as (p: {
      searchParams: Promise<Record<string, string>>;
    }) => Promise<ReactNode>;
    const arbol = await cuerpo({ searchParams: Promise.resolve({}) });
    const orden = tiposEnOrden(arbol).filter((tipo) => [Proximas, PorConfirmar, Documentacion].includes(tipo as never));
    expect(orden).toEqual([Proximas, PorConfirmar, Documentacion]);
  });

  // T-028 B: la entrada al alta es un enlace (el diálogo lo intercepta; sin JS, abre la página).
  it('la cabecera lleva un enlace «Nueva cita» a /agenda/nueva', () => {
    const pagina = PaginaAgenda({ searchParams: Promise.resolve({}) });
    const enlaces: { href: string; children: ReactNode }[] = [];
    const recorrer = (nodo: ReactNode) => {
      if (Array.isArray(nodo)) nodo.forEach(recorrer);
      else if (isValidElement<{ href?: string; children?: ReactNode }>(nodo)) {
        if (nodo.type === Link) enlaces.push({ href: nodo.props.href as string, children: nodo.props.children });
        recorrer(nodo.props.children);
      }
    };
    recorrer(pagina);
    expect(enlaces).toEqual([{ href: '/agenda/nueva', children: 'Nueva cita' }]);
  });
});
