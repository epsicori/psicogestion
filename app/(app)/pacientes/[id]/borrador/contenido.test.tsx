import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatosEditor } from '@/lib/economico/borrador';

// T-046 · La pantalla: quien no puede preparar borradores de este paciente ve un 404 (el núcleo
// devuelve null), y un borrador congelado o descartado se pinta sin controles.

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...r}>
      {children}
    </a>
  ),
}));
const deps = { proveedor: () => 'Programa X' };
vi.mock('./datos', () => ({ depsDeSesion: async () => deps }));
const cargarEditor = vi.fn();
const cargarElegibles = vi.fn();
vi.mock('@/lib/economico/borrador', () => ({
  cargarEditor: (...a: unknown[]) => cargarEditor(...a),
  cargarElegibles: (...a: unknown[]) => cargarElegibles(...a),
}));
vi.mock('./acciones', () => ({ guardarBorradorAccion: vi.fn(), descartarBorradorAccion: vi.fn() }));

const { ContenidoEditor } = await import('./contenido');

const PAC = '11111111-1111-4111-8111-111111111111';
const BOR = '33333333-3333-4333-8333-333333333333';

const datos = (estado: NonNullable<DatosEditor['borrador']>['estado']): DatosEditor => ({
  paciente: { id: PAC, nombreCompleto: 'Ana García' },
  borrador: {
    id: BOR,
    numeroVersion: 3,
    estado,
    destinatarioNombre: 'Ana García',
    tieneNif: false,
    lineas: [
      {
        concepto: 'Informe',
        cantidad: 1,
        precio_unitario_centimos: 12100,
        regimen_iva: 'general',
        tipo_iva_centesimas: 2100,
        cita_id: null,
        citaNoElegible: false,
      },
    ],
    base: 10000,
    cuota: 2100,
    total: 12100,
  },
});

const pintar = async (p: { id: string; borradorId?: string }) => render(await ContenidoEditor({ params: Promise.resolve(p) }));

beforeEach(() => {
  vi.clearAllMocks();
  cargarElegibles.mockResolvedValue([]);
});

describe('ContenidoEditor', () => {
  it('sin permiso (técnico, no asignado, paciente invisible): 404, sin pintar nada', async () => {
    cargarEditor.mockResolvedValue(null);
    await expect(pintar({ id: PAC })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
    expect(cargarElegibles).not.toHaveBeenCalled();
  });

  it('CA4 · congelado en el programa: lo dice con su nombre y no ofrece guardar ni descartar', async () => {
    cargarEditor.mockResolvedValue(datos('en_cola'));
    await pintar({ id: PAC, borradorId: BOR });
    expect(screen.getByRole('status')).toHaveTextContent('Ya se preparó en Programa X: no admite cambios');
    expect(screen.getByText(/Al 21 %/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(cargarElegibles).not.toHaveBeenCalled();
  });

  it('descartado: solo lectura', async () => {
    cargarEditor.mockResolvedValue(datos('descartado'));
    await pintar({ id: PAC, borradorId: BOR });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('nuevo: el editor con las sesiones elegibles', async () => {
    cargarEditor.mockResolvedValue({ paciente: { id: PAC, nombreCompleto: 'Ana García' }, borrador: null });
    await pintar({ id: PAC });
    expect(cargarEditor).toHaveBeenCalledWith(deps, PAC, undefined);
    expect(screen.getByRole('heading', { name: 'Nuevo borrador de factura' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeInTheDocument();
  });
});
