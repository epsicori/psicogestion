import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CENTRO = '33333333-3333-4333-8333-333333333333';
const m = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: m.back, push: m.push }) }));
vi.mock('./formulario-alta', () => ({
  FormularioAlta: ({ alTerminar, alCancelar }: { alTerminar: (r: { anuncio: string; fecha: string; centroId: string }) => void; alCancelar: () => void }) => (
    <>
      <button type="button" onClick={() => alTerminar({ anuncio: 'Cita guardada.', fecha: '2026-10-06', centroId: CENTRO })}>
        terminar
      </button>
      <button type="button" onClick={alCancelar}>
        cancelar
      </button>
    </>
  ),
}));

import { FormularioNavegable } from './formulario-navegable';

const props = {
  rol: 'administrador' as const,
  centros: [],
  profesionales: [],
  tipos: [],
  inicial: { paciente: null, centroId: 'c', profesionalId: 'p', clave: null },
  vista: {} as never,
};

beforeEach(() => {
  vi.clearAllMocks();
  document.querySelector('[data-anuncio-global]')?.remove();
});

describe('FormularioNavegable', () => {
  it('en el diálogo, terminar y cancelar vuelven atrás (a donde se estaba)', () => {
    render(<FormularioNavegable {...props} modo="dialogo" />);

    fireEvent.click(screen.getByText('terminar'));
    fireEvent.click(screen.getByText('cancelar'));

    expect(m.back).toHaveBeenCalledTimes(2);
    expect(m.push).not.toHaveBeenCalled();
  });

  it('en la página, cancelar lleva a la agenda y terminar, a la semana de la cita', () => {
    render(<FormularioNavegable {...props} modo="pagina" />);

    fireEvent.click(screen.getByText('terminar'));
    fireEvent.click(screen.getByText('cancelar'));

    // H17: con el centro de la cita; si no, la agenda abre el de la cookie y la cita no se ve.
    expect(m.push).toHaveBeenNthCalledWith(1, `/agenda?fecha=2026-10-06&centro=${CENTRO}`);
    expect(m.push).toHaveBeenNthCalledWith(2, '/agenda');
    expect(m.back).not.toHaveBeenCalled();
  });

  it('el éxito se anuncia en una región de estado que sobrevive a la navegación; cancelar no anuncia nada', () => {
    const { unmount } = render(<FormularioNavegable {...props} modo="pagina" />);

    fireEvent.click(screen.getByText('cancelar'));
    expect(document.querySelector('[data-anuncio-global]')?.textContent ?? '').toBe('');

    fireEvent.click(screen.getByText('terminar'));
    unmount();

    const region = document.querySelector('[data-anuncio-global]') as HTMLElement;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.textContent).toBe('Cita guardada.');
  });

  it('también en el diálogo se anuncia al cerrar', () => {
    render(<FormularioNavegable {...props} modo="dialogo" />);

    fireEvent.click(screen.getByText('terminar'));

    expect(document.querySelector('[data-anuncio-global]')?.textContent).toBe('Cita guardada.');
  });

  // H14 (ronda 3): una región viva que nace ya con texto no se anuncia; tiene que existir antes.
  it('la región de estado existe, vacía, en cuanto se monta el formulario (antes de cualquier anuncio)', () => {
    render(<FormularioNavegable {...props} modo="dialogo" />);

    const region = document.querySelector('[data-anuncio-global]') as HTMLElement;
    expect(region).not.toBeNull();
    expect(region.getAttribute('role')).toBe('status');
    expect(region.textContent).toBe('');
  });

  it('el primer anuncio solo cambia el texto de la región que ya estaba, sin crear otra', () => {
    render(<FormularioNavegable {...props} modo="dialogo" />);
    const antes = document.querySelector('[data-anuncio-global]');

    fireEvent.click(screen.getByText('terminar'));

    expect(document.querySelectorAll('[data-anuncio-global]')).toHaveLength(1);
    expect(document.querySelector('[data-anuncio-global]')).toBe(antes);
  });
});
