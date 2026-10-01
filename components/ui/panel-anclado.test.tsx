import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { colocarPanel } from './colocacion';
import { PanelAnclado } from './panel-anclado';

function rect(top: number, left: number, width: number, height: number): DOMRect {
  return { top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

// El panel se abre SIEMPRE desde su ancla con estado real, como en el calendario.
function Montaje({ pausado = false, alCerrar }: { pausado?: boolean; alCerrar?: () => void }) {
  // El ancla se guarda en estado al abrir, como hará el calendario: leer un ref al
  // renderizar no vuelve a pintar cuando cambia.
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  return (
    <>
      <button type="button" onClick={(evento) => setAncla(evento.currentTarget)}>
        Día 8
      </button>
      <button type="button">Del fondo</button>
      {ancla && (
        <PanelAnclado
          ancla={ancla}
          titulo="Jueves 8"
          pausado={pausado}
          alCerrar={() => {
            alCerrar?.();
            setAncla(null);
          }}
        >
          <button type="button">Primera cita</button>
          <button type="button">Segunda cita</button>
        </PanelAnclado>
      )}
    </>
  );
}

async function abrir(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole('button', { name: 'Día 8' }));
  return screen.getByRole('dialog', { name: 'Jueves 8' });
}

// jsdom no maqueta (`offsetParent` siempre null): sin esto `enfocables()` sale vacía y el
// foco inicial y la trampa de Tab no se ejercerían de verdad.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
    return this.isConnected ? document.body : null;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('PanelAnclado', () => {
  it('es un diálogo NO modal con nombre, y el foco inicial cae dentro, en el primer enfocable', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);
    const panel = await abrir(usuario);
    expect(panel).not.toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Primera cita' }));
  });

  it('Tab no sale del panel', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);
    const panel = await abrir(usuario);
    for (let i = 0; i < 5; i++) {
      await usuario.tab();
      expect(panel.contains(document.activeElement)).toBe(true);
    }
    await usuario.tab({ shift: true });
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('Escape llama a alCerrar', async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    render(<Montaje alCerrar={alCerrar} />);
    await abrir(usuario);
    await usuario.keyboard('{Escape}');
    expect(alCerrar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('un clic fuera cierra; uno dentro no', async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    render(<Montaje alCerrar={alCerrar} />);
    await abrir(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Segunda cita' }));
    expect(alCerrar).not.toHaveBeenCalled();
    await usuario.click(screen.getByRole('button', { name: 'Del fondo' }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('con pausado, ni Escape ni el clic fuera lo cierran (hay un diálogo encima)', async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    render(<Montaje pausado alCerrar={alCerrar} />);
    await abrir(usuario);
    await usuario.keyboard('{Escape}');
    await usuario.click(screen.getByRole('button', { name: 'Del fondo' }));
    expect(alCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // D9 y revisión TS H3: con otro panel encima, este no se ve, no lo alcanza el lector ni el
  // teclado, y no se cierra; al volver a la cima se recoloca.
  it('con oculto: hidden e inert, no se cierra, y al dejar de estarlo vuelve a verse colocado', async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    const ANCLA = rect(100, 100, 100, 40);
    let medidas = 0;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'dialog') medidas += 1;
      return this.getAttribute('role') === 'dialog' ? rect(0, 0, 320, 240) : ANCLA;
    });
    function ConOculto({ oculto }: { oculto: boolean }) {
      const [ancla, setAncla] = useState<HTMLElement | null>(null);
      return (
        <>
          <button type="button" onClick={(e) => setAncla(e.currentTarget)}>
            Día 8
          </button>
          <button type="button">Del fondo</button>
          {ancla && (
            <PanelAnclado ancla={ancla} titulo="Jueves 8" oculto={oculto} alCerrar={alCerrar}>
              <button type="button">Primera cita</button>
            </PanelAnclado>
          )}
        </>
      );
    }
    const { rerender } = render(<ConOculto oculto={false} />);
    const panel = await abrir(usuario);

    rerender(<ConOculto oculto />);
    expect(panel).toHaveAttribute('hidden');
    expect(panel).toHaveAttribute('inert');
    expect(screen.queryByRole('dialog')).toBeNull();
    await usuario.keyboard('{Escape}');
    await usuario.click(screen.getByRole('button', { name: 'Del fondo' }));
    expect(alCerrar).not.toHaveBeenCalled();

    const antes = medidas;
    rerender(<ConOculto oculto={false} />);
    expect(screen.getByRole('dialog', { name: 'Jueves 8' })).toBe(panel);
    expect(panel).not.toHaveAttribute('inert');
    expect(medidas).toBeGreaterThan(antes);
  });

  it('se coloca donde dice colocarPanel', async () => {
    const usuario = userEvent.setup();
    const ANCLA = rect(700, 1180, 100, 40);
    const PANEL = rect(0, 0, 320, 240);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'dialog' ? PANEL : ANCLA;
    });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);

    render(<Montaje />);
    const panel = await abrir(usuario);

    const esperado = colocarPanel({
      ancla: ANCLA,
      panel: { width: 320, height: 240 },
      limites: { top: 0, left: 0, width: 1280, height: 800 },
    });
    expect(esperado.lado).toBe('arriba');
    expect(panel.style.top).toBe(`${esperado.top}px`);
    expect(panel.style.left).toBe(`${esperado.left}px`);
    expect(panel).toHaveAttribute('data-lado', 'arriba');
  });
});

// Revisión de cierre N2: la fila del panel del día es el ancla del panel de la cita, y en el mismo
// commit el panel del día pasa a `hidden`: su caja mide cero y el pico apuntaría a la esquina.
describe('PanelAnclado con el ancla oculta', () => {
  const SIN_CAJA = rect(0, 0, 0, 0);
  const DIA = rect(300, 600, 40, 28);
  const PANEL = rect(0, 0, 320, 240);

  function Doble() {
    const [anclas, setAnclas] = useState<{ fila: HTMLElement; dia: HTMLElement } | null>(null);
    return (
      <>
        <button type="button" data-rol="dia">
          Día 8
        </button>
        <button
          type="button"
          onClick={(e) => setAnclas({ fila: e.currentTarget, dia: document.querySelector<HTMLElement>('[data-rol=dia]')! })}
        >
          Fila
        </button>
        {anclas && (
          <PanelAnclado ancla={anclas.fila} respaldo={anclas.dia} titulo="Cita" alCerrar={() => setAnclas(null)}>
            <button type="button">Dentro</button>
          </PanelAnclado>
        )}
      </>
    );
  }

  it('si el ancla no tiene caja, se coloca contra el respaldo (el día que sigue visible)', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'dialog') return PANEL;
      return this.getAttribute('data-rol') === 'dia' ? DIA : SIN_CAJA;
    });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);

    render(<Doble />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Fila' }));
    const panel = screen.getByRole('dialog', { name: 'Cita' });

    const esperado = colocarPanel({
      ancla: DIA,
      panel: { width: 320, height: 240 },
      limites: { top: 0, left: 0, width: 1280, height: 800 },
    });
    expect(esperado.top).toBeGreaterThan(100); // no pegado arriba
    expect(panel.style.top).toBe(`${esperado.top}px`);
    expect(panel.style.left).toBe(`${esperado.left}px`);
  });

  it('con una ventana de 360 px el panel entero cabe en horizontal', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'dialog') return rect(0, 0, 328, 240);
      return this.getAttribute('data-rol') === 'dia' ? rect(300, 330, 28, 28) : SIN_CAJA;
    });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(360);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(640);

    render(<Doble />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Fila' }));
    const panel = screen.getByRole('dialog', { name: 'Cita' });
    const izquierda = parseFloat(panel.style.left);
    expect(izquierda).toBeGreaterThanOrEqual(0);
    expect(izquierda + 328).toBeLessThanOrEqual(360);
  });
});
