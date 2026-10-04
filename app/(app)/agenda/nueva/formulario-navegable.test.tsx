import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: m.back, push: m.push }) }));
vi.mock('./formulario-alta', () => ({
  FormularioAlta: ({ alTerminar, alCancelar }: { alTerminar: (r: { anuncio: string; fecha: string }) => void; alCancelar: () => void }) => (
    <>
      <button type="button" onClick={() => alTerminar({ anuncio: 'Cita guardada.', fecha: '2026-10-06' })}>
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

    expect(m.push).toHaveBeenNthCalledWith(1, '/agenda?fecha=2026-10-06');
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
});
