import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { tCon } from '@/lib/i18n';

vi.mock('./acciones', () => ({
  registrarCobro: vi.fn(),
  cargarCobrosAsignables: vi.fn(),
  asignarCobroAFactura: vi.fn(),
}));

const { AccionesDeFactura } = await import('./acciones-factura');

const FACTURA = { id: 'f0000000-0000-4000-8000-000000000001', numero: 'F-2026-0007', pacienteId: 'p1', paciente: 'Ruiz, Ana' };

describe('AccionesDeFactura', () => {
  it('con cobros sin factura ofrece registrar y asignar, cada uno nombrando la factura', () => {
    render(<AccionesDeFactura factura={FACTURA} cobrosSinFactura={2} zona="Europe/Madrid" hoy="2026-10-16" />);
    expect(
      screen.getByRole('button', { name: tCon('cobros.facturas.registrarDeFactura', { numero: 'F-2026-0007' }) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: tCon('cobros.facturas.asignarDeFactura', { numero: 'F-2026-0007' }) }),
    ).toBeInTheDocument();
  });

  it('sin cobros sin factura no hay nada que asignar: solo registrar', () => {
    render(<AccionesDeFactura factura={FACTURA} cobrosSinFactura={0} zona="Europe/Madrid" hoy="2026-10-16" />);
    expect(
      screen.getByRole('button', { name: tCon('cobros.facturas.registrarDeFactura', { numero: 'F-2026-0007' }) }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: tCon('cobros.facturas.asignarDeFactura', { numero: 'F-2026-0007' }) }),
    ).toBeNull();
  });
});
