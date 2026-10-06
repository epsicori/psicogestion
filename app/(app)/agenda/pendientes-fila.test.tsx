import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AlertaPendiente } from '@/lib/citas/agenda';

vi.mock('./resolver-alerta', () => ({
  ResolverAlerta: ({ alertaId, pacienteId }: { alertaId: string; pacienteId: string }) => (
    <button type="button" data-resolver={alertaId} data-paciente={pacienteId}>
      Resolver
    </button>
  ),
}));

import { FilaPaciente } from './pendientes-fila';
import { agruparYOrdenar, presentarGrupo, type GrupoPresentado } from './pendientes';

function alerta(i: number, parcial: Partial<AlertaPendiente> = {}): AlertaPendiente {
  return {
    id: `a${String(i).padStart(2, '0')}`,
    pacienteId: 'p1',
    tipo: 'nota_sin_firmar',
    fechaReferencia: '2026-09-20',
    creadaEn: '2026-09-20T10:00:00Z',
    nivel: 1,
    origenTabla: 'citas',
    origenId: `c${i}`,
    ...parcial,
  };
}

function grupoDe(
  alertas: AlertaPendiente[],
  modo: 'desplegable' | 'completo' = 'desplegable',
  rol: 'administrador' | 'tecnico_administrativo' = 'administrador',
): GrupoPresentado {
  return presentarGrupo(agruparYOrdenar(alertas)[0], {
    rol,
    hoy: '2026-10-02',
    nombre: 'Ana López',
    modo,
    filtros: { tipo: null, nivel: null, paciente: null },
  });
}

function pintar(grupo: GrupoPresentado, modo: 'desplegable' | 'completo' = 'desplegable') {
  return render(
    <ul>
      <li>
        <FilaPaciente grupo={grupo} prefijo="panel" modo={modo} />
      </li>
    </ul>,
  );
}

describe('FilaPaciente: un solo pendiente', () => {
  it('no es un desplegable: enlace al paciente, un enlace por pendiente y su resolver', () => {
    pintar(grupoDe([alerta(1, { tipo: 'informe_pendiente', origenTabla: null, origenId: null })]));

    expect(screen.queryByRole('button', { name: /Ana López/ })).toBeNull();
    const paciente = screen.getByRole('link', { name: 'Ana López' });
    expect(paciente.getAttribute('href')).toBe('/pacientes/p1');
    expect(paciente.id).toBe('panel-paciente-p1');

    const enlace = screen.getByRole('link', { name: 'Informe pendiente de Ana López: ir a la ficha' });
    expect(enlace.getAttribute('href')).toBe('/pacientes/p1');
    expect(enlace.textContent).toBe('Informe pendiente');
    expect(screen.getByText('pendiente desde hace 12 días')).toBeTruthy();
    expect(document.querySelector('[data-resolver="a01"]')?.getAttribute('data-paciente')).toBe('p1');
  });

  it('la nota sin firmar enlaza a la nota y no ofrece resolver; el nombre accesible contiene el texto visible', () => {
    pintar(grupoDe([alerta(1)]));
    const enlace = screen.getByRole('link', { name: 'Nota sin firmar de Ana López: abrir la nota' });
    expect(enlace.getAttribute('href')).toBe('/pacientes/p1/historia/notas?cita=c1');
    expect(enlace.getAttribute('aria-label')?.startsWith(enlace.textContent ?? '#')).toBe(true);
    expect(document.querySelector('[data-resolver]')).toBeNull();
  });

  it('el técnico no recibe el enlace a la nota ni el botón', () => {
    pintar(grupoDe([alerta(1)], 'desplegable', 'tecnico_administrativo'));
    expect(
      screen.getByRole('link', { name: 'Nota sin firmar de Ana López: ir a la ficha' }).getAttribute('href'),
    ).toBe('/pacientes/p1');
    expect(document.querySelector('[data-resolver]')).toBeNull();
  });
});

describe('FilaPaciente: varios pendientes, desplegable', () => {
  const alertas = [alerta(1, { nivel: 3 }), alerta(2, { tipo: 'informe_pendiente', origenTabla: null }), alerta(3)];

  it('un botón con estado, nombre accesible y resumen fuera del botón', () => {
    pintar(grupoDe(alertas));
    const boton = screen.getByRole('button', { name: 'Ana López, 3 pendientes, 1 escalado' });
    expect(boton.getAttribute('aria-expanded')).toBe('false');

    const lista = document.getElementById(boton.getAttribute('aria-controls')!)!;
    expect(lista.tagName).toBe('UL');
    expect(lista.hasAttribute('hidden')).toBe(true);

    const resumen = document.getElementById(boton.getAttribute('aria-describedby')!)!;
    expect(resumen.textContent).toBe('2 notas · 1 informe — el más antiguo, hace 12 días');
    expect(boton.contains(resumen)).toBe(false);
    expect(boton.textContent).toContain('3 pendientes');
  });

  it('la píldora de urgencia vive fuera del botón', () => {
    pintar(grupoDe(alertas));
    const boton = screen.getByRole('button', { name: /Ana López/ });
    const filaCabecera = boton.closest('li')!;
    const pildoras = within(filaCabecera).getAllByText('Muy atrasada');
    expect(pildoras.length).toBeGreaterThan(0);
    for (const p of pildoras) expect(boton.contains(p)).toBe(false);
  });

  it('abre y cierra con el clic y conserva el foco en el botón', () => {
    pintar(grupoDe(alertas));
    const boton = screen.getByRole('button', { name: /Ana López/ });
    const lista = document.getElementById(boton.getAttribute('aria-controls')!)!;
    boton.focus();

    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(lista.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement).toBe(boton);
    expect(within(lista).getAllByRole('link')).toHaveLength(3);

    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(lista.hasAttribute('hidden')).toBe(true);
  });

  // R2-H2 (criterio 3), literal: Tab desde el nombre llega al botón, Intro abre y Espacio cierra y abre.
  it('Tab desde el nombre llega al botón; Intro abre y Espacio cierra y vuelve a abrir', async () => {
    const user = userEvent.setup();
    pintar(grupoDe(alertas));
    const boton = screen.getByRole('button', { name: /Ana López/ });
    const lista = document.getElementById(boton.getAttribute('aria-controls')!)!;

    screen.getByRole('link', { name: 'Ana López' }).focus();
    await user.tab();
    expect(document.activeElement).toBe(boton);

    await user.keyboard('{Enter}');
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(lista.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement).toBe(boton);

    await user.keyboard(' ');
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(lista.hasAttribute('hidden')).toBe(true);

    await user.keyboard(' ');
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(boton);
  });

  // Criterio 3: no es un acordeón; abrir una fila no cierra otra.
  it('dos filas abiertas a la vez, con el teclado', async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <li>
          <FilaPaciente grupo={grupoDe(alertas)} prefijo="panel" modo="desplegable" />
        </li>
        <li>
          <FilaPaciente grupo={{ ...grupoDe(alertas), pacienteId: 'p2', nombre: 'Berta Ruiz', textoAccesible: 'Berta Ruiz, 3 pendientes' }} prefijo="panel" modo="desplegable" />
        </li>
      </ul>,
    );
    const primera = screen.getByRole('button', { name: /Ana López/ });
    const segunda = screen.getByRole('button', { name: /Berta Ruiz/ });
    primera.focus();
    await user.keyboard('{Enter}');
    segunda.focus();
    await user.keyboard(' ');
    expect(primera.getAttribute('aria-expanded')).toBe('true');
    expect(segunda.getAttribute('aria-expanded')).toBe('true');
  });

  it('no guarda el estado abierto en ningún sitio (D9)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const cookie = vi.spyOn(document, 'cookie', 'set');
    pintar(grupoDe(alertas));
    fireEvent.click(screen.getByRole('button', { name: /Ana López/ }));
    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
    setItem.mockRestore();
    cookie.mockRestore();
  });

  it('más de 10: la lista corta y cierra con «Ver todos (N)» hacia esa paciente', () => {
    const muchas = Array.from({ length: 12 }, (_, i) => alerta(i + 1, { tipo: 'informe_pendiente', origenTabla: null }));
    pintar(grupoDe(muchas));
    const boton = screen.getByRole('button', { name: /Ana López/ });
    fireEvent.click(boton);
    const lista = document.getElementById(boton.getAttribute('aria-controls')!)!;
    const ver = within(lista).getByRole('link', { name: 'Ver todos (12)' });
    expect(ver.getAttribute('href')).toBe('/agenda/documentacion?paciente=p1');
    // 10 pendientes + el enlace de «Ver todos»
    expect(within(lista).getAllByRole('link')).toHaveLength(11);
  });

  it('el icono de «muy atrasada» es un SVG decorativo con borde; el nivel 2 no lo lleva', () => {
    const { container, unmount } = pintar(grupoDe(alertas));
    const insignia = container.querySelector('[data-urgencia="muy-atrasada"]')!;
    expect(insignia).toBeTruthy();
    expect(insignia.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(insignia.className).toContain('border-2');
    unmount();

    const atrasada = pintar(grupoDe([alerta(1, { nivel: 2 }), alerta(2)]));
    const otra = atrasada.container.querySelector('[data-urgencia="atrasada"]')!;
    expect(otra).toBeTruthy();
    expect(otra.querySelector('svg')).toBeNull();
    expect(otra.className).not.toContain('border-2');
  });

  it('sin urgencia no hay atributo; sin animación ni latido en ningún caso', () => {
    const { container } = pintar(grupoDe([alerta(1), alerta(2)]));
    expect(container.querySelector('[data-urgencia]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/animate-|latido|duration-/);
  });
});

describe('FilaPaciente: modo completo', () => {
  it('con varios pendientes no hay botón y salen todos, sin «Ver todos»', () => {
    const muchas = Array.from({ length: 12 }, (_, i) => alerta(i + 1, { tipo: 'informe_pendiente', origenTabla: null }));
    pintar(grupoDe(muchas, 'completo'), 'completo');
    expect(screen.queryByRole('button', { name: /Ana López/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /Informe pendiente de Ana López/ })).toHaveLength(12);
    expect(screen.queryByRole('link', { name: /Ver todos/ })).toBeNull();
    expect(screen.getByText('12 pendientes')).toBeTruthy();
  });
});
