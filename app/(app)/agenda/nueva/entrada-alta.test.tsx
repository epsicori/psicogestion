import Link from 'next/link';
import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/citas/agenda', () => ({ leerCitasRango: vi.fn() }));
vi.mock('@/lib/citas/propuestas', () => ({ listarPropuestasPendientes: vi.fn() }));
vi.mock('../acciones', () => ({}));
vi.mock('../calendario', () => ({ Calendario: () => null }));
vi.mock('../cuadro', () => ({ Cuadro: () => null }));
vi.mock('../datos', () => ({ cargarContexto: vi.fn() }));
vi.mock('../documentacion', () => ({ Documentacion: () => null }));
vi.mock('../por-confirmar', () => ({ PorConfirmar: () => null }));
vi.mock('../proximas', () => ({ Proximas: () => null }));

import PaginaAgenda from '../page';

describe('Entrada al alta desde la agenda', () => {
  // El diálogo `@modal` intercepta el enlace; sin JavaScript o con recarga, abre la página.
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
