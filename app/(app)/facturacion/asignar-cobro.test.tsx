import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t, tCon } from '@/lib/i18n';

const cargarCobrosAsignables = vi.fn();
const asignarCobroAFactura = vi.fn();
vi.mock('./acciones', () => ({
  cargarCobrosAsignables: (...a: unknown[]) => cargarCobrosAsignables(...a),
  asignarCobroAFactura: (...a: unknown[]) => asignarCobroAFactura(...a),
}));

const { AsignarCobro } = await import('./asignar-cobro');

const FACTURA = { id: 'f0000000-0000-4000-8000-000000000001', numero: 'F-2026-0007' };
const COBRO_A = {
  id: 'c0000000-0000-4000-8000-00000000000a',
  importeCentimos: 6000,
  fecha: '2026-10-02',
  formaPago: 'bizum' as const,
  referencia: 'Ref-1',
  motivo: null,
};
const COBRO_B = {
  id: 'c0000000-0000-4000-8000-00000000000b',
  importeCentimos: -1500,
  fecha: '2026-10-05',
  formaPago: 'efectivo' as const,
  referencia: null,
  motivo: 'Sesión cancelada',
};

const NOMBRE_DISPARADOR = tCon('cobros.facturas.asignarDeFactura', { numero: FACTURA.numero });

function pintar() {
  render(<AsignarCobro factura={FACTURA} zona="Europe/Madrid" />);
  return screen.getByRole('button', { name: NOMBRE_DISPARADOR });
}

async function abrir() {
  const boton = pintar();
  boton.focus();
  await act(async () => {
    fireEvent.click(boton);
  });
  return boton;
}

beforeEach(() => {
  cargarCobrosAsignables.mockReset();
  asignarCobroAFactura.mockReset();
});

describe('AsignarCobro', () => {
  it('el disparador nombra la factura, mide 44 px y la región de estado existe, vacía, desde el montaje', () => {
    const boton = pintar();
    expect(boton.className).toMatch(/min-h-11/);
    expect(boton).toHaveTextContent(t('cobros.facturas.asignar'));
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(region.className).not.toContain('empty:hidden');
    expect(cargarCobrosAsignables).not.toHaveBeenCalled();
  });

  it('al abrir pide los cobros asignables de ESA factura y muestra «cargando» mientras llegan', async () => {
    let resolver: (v: unknown) => void = () => {};
    cargarCobrosAsignables.mockReturnValue(new Promise((r) => (resolver = r)));
    await abrir();
    expect(
      screen.getByRole('dialog', { name: tCon('cobros.facturas.tituloAsignar', { numero: FACTURA.numero }) }),
    ).toBeInTheDocument();
    expect(cargarCobrosAsignables).toHaveBeenCalledWith({ facturaEspejoId: FACTURA.id });
    expect(screen.getByText(t('cobros.facturas.cargandoCobros'))).toBeInTheDocument();
    await act(async () => resolver({ ok: true, cobros: [COBRO_A], hayMas: false }));
    expect(screen.queryByText(t('cobros.facturas.cargandoCobros'))).toBeNull();
    expect(screen.getByLabelText(t('cobros.facturas.cobro'))).toBeInTheDocument();
  });

  it('ofrece los cobros con fecha, importe, forma y referencia/motivo; sin nota si no hay más', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A, COBRO_B], hayMas: false });
    await abrir();
    const opciones = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(opciones[0]).toBe(t('cobros.facturas.eligeCobro'));
    expect(opciones[1]).toContain('02/10/2026');
    expect(opciones[1]).toContain('60,00');
    expect(opciones[1]).toContain(t('cobros.formas.bizum'));
    expect(opciones[1]).toContain('Ref-1');
    expect(opciones[2]).toContain('15,00');
    expect(opciones[2]).toContain('Sesión cancelada');
    expect(screen.queryByText(t('cobros.facturas.hayMas'))).toBeNull();
  });

  it('con hayMas avisa de que se muestran los más recientes', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A], hayMas: true });
    await abrir();
    expect(screen.getByText(t('cobros.facturas.hayMas'))).toBeInTheDocument();
  });

  it('sin cobros asignables lo dice y no ofrece enviar', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [], hayMas: false });
    await abrir();
    expect(screen.getByText(t('cobros.facturas.sinCobrosAsignables'))).toBeInTheDocument();
    expect(screen.queryByLabelText(t('cobros.facturas.cobro'))).toBeNull();
  });

  it('si la lectura falla, lo dice con un aviso y no ofrece enviar a ciegas', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: false });
    await abrir();
    expect(screen.getByText(t('cobros.facturas.errorCobrosAsignables'))).toBeInTheDocument();
    expect(screen.queryByLabelText(t('cobros.facturas.cobro'))).toBeNull();
  });

  it('si la lectura rechaza (red), el mismo aviso', async () => {
    cargarCobrosAsignables.mockRejectedValue(new Error('red'));
    await abrir();
    expect(await screen.findByText(t('cobros.facturas.errorCobrosAsignables'))).toBeInTheDocument();
  });

  it('enviar sin elegir no llama a la acción, avisa junto al campo y lleva el foco allí', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A], hayMas: false });
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('cobros.facturas.asignar') }));
    });
    expect(asignarCobroAFactura).not.toHaveBeenCalled();
    expect(screen.getByText(t('cobros.facturas.eligeCobro'), { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByLabelText(t('cobros.facturas.cobro'))).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(t('cobros.facturas.cobro'))));
  });

  it('elegir y enviar manda {cobroId, facturaEspejoId}; con éxito cierra, devuelve el foco y anuncia', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A, COBRO_B], hayMas: false });
    asignarCobroAFactura.mockResolvedValue({ mensaje: t('cobros.facturas.cobroAsignado') });
    const boton = await abrir();
    fireEvent.change(screen.getByLabelText(t('cobros.facturas.cobro')), { target: { value: COBRO_B.id } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('cobros.facturas.asignar') }));
    });
    expect(asignarCobroAFactura).toHaveBeenCalledWith({ cobroId: COBRO_B.id, facturaEspejoId: FACTURA.id });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(boton);
    expect(screen.getByRole('status')).toHaveTextContent(t('cobros.facturas.cobroAsignado'));
  });

  it('«ya estaba en esta factura» también se da por asignado: cierra y anuncia ese texto', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A], hayMas: false });
    asignarCobroAFactura.mockResolvedValue({ mensaje: t('cobros.facturas.cobroYaEstaba') });
    await abrir();
    fireEvent.change(screen.getByLabelText(t('cobros.facturas.cobro')), { target: { value: COBRO_A.id } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('cobros.facturas.asignar') }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent(t('cobros.facturas.cobroYaEstaba'));
  });

  it('si el botón se va con el diálogo abierto y luego llega el éxito, el foco va a la región (T-052, caso C)', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A], hayMas: false });
    let resolver: (v: { mensaje: string }) => void = () => {};
    asignarCobroAFactura.mockReturnValue(new Promise((r) => (resolver = r)));
    const { rerender } = render(<AsignarCobro factura={FACTURA} zona="Europe/Madrid" />);
    const boton = screen.getByRole('button', { name: NOMBRE_DISPARADOR });
    boton.focus();
    await act(async () => {
      fireEvent.click(boton);
    });
    fireEvent.change(screen.getByLabelText(t('cobros.facturas.cobro')), { target: { value: COBRO_A.id } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(t('cobros.facturas.cobro')).closest('form')!);
    });
    await act(async () => {
      rerender(<AsignarCobro factura={FACTURA} zona="Europe/Madrid" disponible={false} />);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      resolver({ mensaje: t('cobros.facturas.cobroAsignado') });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('status'));
  });

  it.each([
    ['cobroYaEnlazado'],
    ['devolucionSuperaLoCobrado'],
    ['noSePudoAsignar'],
  ] as const)('un rechazo «%s» no cierra: se dice en el diálogo, se anuncia y el foco va al selector', async (clave) => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A], hayMas: false });
    asignarCobroAFactura.mockResolvedValue({ mensaje: t(`cobros.facturas.${clave}`) });
    await abrir();
    fireEvent.change(screen.getByLabelText(t('cobros.facturas.cobro')), { target: { value: COBRO_A.id } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('cobros.facturas.asignar') }));
    });
    expect(await screen.findByText(t(`cobros.facturas.${clave}`))).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(t('cobros.facturas.cobro'))));
  });

  it('si la acción rechaza (red) no se da por asignado: avisa que no se sabe y sigue montado', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A], hayMas: false });
    asignarCobroAFactura.mockRejectedValue(new Error('red'));
    await abrir();
    fireEvent.change(screen.getByLabelText(t('cobros.facturas.cobro')), { target: { value: COBRO_A.id } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('cobros.facturas.asignar') }));
    });
    expect(await screen.findByText(t('cobros.resultadoDesconocido'))).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('con un envío en vuelo: texto «Asignando…», aria-disabled, un segundo clic no repite y Escape no cierra', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A], hayMas: false });
    let resolver: (v: unknown) => void = () => {};
    asignarCobroAFactura.mockReturnValue(new Promise((r) => (resolver = r)));
    await abrir();
    fireEvent.change(screen.getByLabelText(t('cobros.facturas.cobro')), { target: { value: COBRO_A.id } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('cobros.facturas.asignar') }));
    });
    const enviando = screen.getByRole('button', { name: t('cobros.facturas.asignando') });
    expect(enviando).toHaveAttribute('aria-disabled', 'true');
    expect(enviando).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(enviando);
    });
    expect(asignarCobroAFactura).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => resolver({ mensaje: t('cobros.facturas.cobroAsignado') }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cerrar sin asignar no anuncia nada; al reabrir vuelve a pedir la lista (no hay una vieja)', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A], hayMas: false });
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: t('interfaz.cerrar') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: NOMBRE_DISPARADOR }));
    });
    expect(cargarCobrosAsignables).toHaveBeenCalledTimes(2);
  });

  it('ADR-078: ningún verbo de factura en el diálogo', async () => {
    cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A], hayMas: false });
    await abrir();
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.textContent).not.toMatch(/emitir|facturar|expedir|aprobar|crear factura|verifactu/i);
  });
});
