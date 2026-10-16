import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { t, tCon } from '@/lib/i18n';

const cargarCobrosAsignables = vi.fn();
const asignarCobroAFactura = vi.fn();
vi.mock('./acciones', () => ({
  registrarCobro: vi.fn(),
  cargarCobrosAsignables: (...a: unknown[]) => cargarCobrosAsignables(...a),
  asignarCobroAFactura: (...a: unknown[]) => asignarCobroAFactura(...a),
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

  it('al asignar el ÚLTIMO cobro suelto, el aviso sigue anunciado y el foco no cae en body (H1)', async () => {
    const COBRO = {
      id: 'c0000000-0000-4000-8000-00000000000a',
      importeCentimos: 6000,
      fecha: '2026-10-02',
      formaPago: 'bizum' as const,
      referencia: null,
      motivo: null,
    };
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO], hayMas: false });
    asignarCobroAFactura.mockResolvedValue({ mensaje: t('cobros.facturas.cobroAsignado') });
    const props = { factura: FACTURA, zona: 'Europe/Madrid', hoy: '2026-10-16' };
    const { rerender } = render(<AccionesDeFactura {...props} cobrosSinFactura={1} />);
    const disparador = screen.getByRole('button', {
      name: tCon('cobros.facturas.asignarDeFactura', { numero: 'F-2026-0007' }),
    });
    disparador.focus();
    await act(async () => {
      fireEvent.click(disparador);
    });
    fireEvent.change(screen.getByLabelText(t('cobros.facturas.cobro')), { target: { value: COBRO.id } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(t('cobros.facturas.cobro')).closest('form')!);
    });
    await waitFor(() => expect(screen.getByText(t('cobros.facturas.cobroAsignado'))).toBeInTheDocument());
    // El `revalidatePath` repinta la fila: ya no queda ningún cobro suelto.
    await act(async () => {
      rerender(<AccionesDeFactura {...props} cobrosSinFactura={0} />);
    });
    expect(screen.queryByRole('button', { name: tCon('cobros.facturas.asignarDeFactura', { numero: 'F-2026-0007' }) })).toBeNull();
    const aviso = screen.getByText(t('cobros.facturas.cobroAsignado'));
    expect(aviso.closest('[role="status"]')).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(aviso.closest('[role="status"]'));
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
