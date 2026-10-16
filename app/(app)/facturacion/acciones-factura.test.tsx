import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('AccionesDeFactura · dos facturas del mismo paciente (T-052 N1)', () => {
  beforeEach(() => {
    cargarCobrosAsignables.mockReset();
    asignarCobroAFactura.mockReset();
  });

  const F1 = { id: 'f0000000-0000-4000-8000-000000000001', numero: 'F-2026-0001', pacienteId: 'p1', paciente: 'Márquez, Lucía' };
  const F2 = { id: 'f0000000-0000-4000-8000-000000000002', numero: 'F-2026-0002', pacienteId: 'p1', paciente: 'Márquez, Lucía' };
  const COBRO_A = {
    id: 'c0000000-0000-4000-8000-00000000000a',
    importeCentimos: 6000,
    fecha: '2026-10-02',
    formaPago: 'bizum' as const,
    referencia: null,
    motivo: null,
  };
  const COBRO_B = { ...COBRO_A, id: 'c0000000-0000-4000-8000-00000000000b' };
  const FILAS = { F1, F2 };

  function Filas({ n, orden }: { n: number; orden: ('F1' | 'F2')[] }) {
    return (
      <>
        {orden.map((clave) => (
          <div key={FILAS[clave].numero} data-testid={`fila-${FILAS[clave].numero}`}>
            <AccionesDeFactura factura={FILAS[clave]} cobrosSinFactura={n} zona="Europe/Madrid" hoy="2026-10-16" />
          </div>
        ))}
      </>
    );
  }

  const botonDe = (f: typeof F1) => screen.queryByRole('button', { name: tCon('cobros.facturas.asignarDeFactura', { numero: f.numero }) });

  function dondeEstaElFoco(): string {
    const activo = document.activeElement;
    if (activo === document.body) return 'body';
    for (const [clave, f] of Object.entries(FILAS)) {
      const fila = screen.getByTestId(`fila-${f.numero}`);
      if (activo && activo.matches('[role="status"][tabindex="-1"]') && fila.contains(activo)) return `región de ${clave}`;
      if (activo === botonDe(f)) return `botón de ${clave}`;
    }
    return activo?.tagName ?? 'nada';
  }

  async function asignar(boton: HTMLElement, cobro: typeof COBRO_A) {
    boton.focus();
    await act(async () => {
      fireEvent.click(boton);
    });
    fireEvent.change(screen.getByLabelText(t('cobros.facturas.cobro')), { target: { value: cobro.id } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(t('cobros.facturas.cobro')).closest('form')!);
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }

  it.each([
    ['F1 antes que F2', ['F1', 'F2']],
    ['F2 antes que F1', ['F2', 'F1']],
  ] as const)('el foco acaba en la región de la fila donde se actuó por última vez (%s)', async (_nombre, orden) => {
    const o = [...orden];
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A, COBRO_B], hayMas: false });
    asignarCobroAFactura.mockResolvedValue({ mensaje: t('cobros.facturas.cobroAsignado') });
    const { rerender } = render(<Filas n={2} orden={o} />);

    await asignar(botonDe(F2)!, COBRO_B);
    await act(async () => {
      rerender(<Filas n={1} orden={o} />);
    });
    expect(dondeEstaElFoco()).toBe('botón de F2');
    expect(screen.getByTestId('fila-F-2026-0002').querySelector('[role="status"][tabindex="-1"]')).toHaveTextContent(
      t('cobros.facturas.cobroAsignado'),
    );

    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A], hayMas: false });
    await asignar(botonDe(F1)!, COBRO_A);
    expect(dondeEstaElFoco()).toBe('botón de F1');
    await act(async () => {
      rerender(<Filas n={0} orden={o} />);
    });
    expect(botonDe(F1)).toBeNull();
    expect(botonDe(F2)).toBeNull();
    expect(dondeEstaElFoco()).toBe('región de F1');
    expect(screen.getByTestId('fila-F-2026-0002').querySelector('[role="status"][tabindex="-1"]')).toHaveTextContent(
      t('cobros.facturas.cobroAsignado'),
    );
  });
});
