import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { t, tCon } from '@/lib/i18n';

import type { FacturaListada } from './datos';

// Las acciones son de cliente y tienen sus propias pruebas: aquí solo importa si la fila las monta y con qué.
const acciones = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('./acciones-factura', () => ({
  AccionesDeFactura: (props: Record<string, unknown>) => {
    acciones.props.push(props);
    return <div data-testid="acciones" />;
  },
}));

const { FilaFactura } = await import('./fila-factura');

const BASE: FacturaListada = {
  id: 'f0000000-0000-4000-8000-000000000001',
  pacienteId: 'd0000000-0000-4000-8000-000000000001',
  nombre: 'Lucía',
  apellidos: 'Pérez Gil',
  fusionado: false,
  programa: 'Holded',
  numero: 'F-2026-0007',
  fecha: '2026-10-03',
  totalCentimos: 12000,
  url: 'https://app.holded.com/doc/1',
  cobros: [],
  cobrosSinFactura: 0,
};

function pintar(factura: Partial<FacturaListada> = {}, hoy = '2026-10-16') {
  acciones.props.length = 0;
  return render(
    <ul>
      <FilaFactura factura={{ ...BASE, ...factura }} zona="Europe/Madrid" hoy={hoy} />
    </ul>,
  );
}

describe('FilaFactura', () => {
  it('enseña número, fecha, total, el programa que la emitió y el paciente', () => {
    pintar();
    const fila = screen.getByRole('listitem');
    expect(fila).toHaveTextContent('F-2026-0007');
    expect(fila).toHaveTextContent('03/10/2026');
    expect(fila).toHaveTextContent('120,00');
    expect(fila).toHaveTextContent(tCon('cobros.facturas.emitidaEn', { programa: 'Holded', numero: 'F-2026-0007' }));
    expect(fila).toHaveTextContent('Lucía Pérez Gil');
  });

  it('el enlace al programa abre en pestaña nueva, sin opener, y nombra el programa', () => {
    pintar();
    const enlace = screen.getByRole('link', { name: new RegExp(tCon('cobros.facturas.verEnPrograma', { programa: 'Holded' })) });
    expect(enlace).toHaveAttribute('href', 'https://app.holded.com/doc/1');
    expect(enlace).toHaveAttribute('target', '_blank');
    expect(enlace.getAttribute('rel')).toContain('noopener');
    expect(enlace.getAttribute('rel')).toContain('noreferrer');
  });

  it('sin url no hay enlace', () => {
    pintar({ url: null });
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('un paciente sin nombre legible se muestra con el texto de reserva', () => {
    pintar({ nombre: '', apellidos: '' });
    expect(screen.getByRole('listitem')).toHaveTextContent(t('cobros.facturas.pacienteSinNombre'));
  });

  it('sin cobros: «Sin cobros en la app»', () => {
    pintar();
    expect(screen.getByText(t('cobros.facturas.sinCobros'))).toBeInTheDocument();
  });

  it('con cobros: fecha, importe, forma y referencia de cada uno; una devolución dice su motivo', () => {
    pintar({
      cobros: [
        { id: 'c1', importeCentimos: 6000, fecha: '2026-10-04', formaPago: 'bizum', referencia: 'Ref-9', motivo: null },
        { id: 'c2', importeCentimos: -1500, fecha: '2026-10-06', formaPago: 'efectivo', referencia: null, motivo: 'Sesión cancelada' },
      ],
    });
    expect(screen.queryByText(t('cobros.facturas.sinCobros'))).toBeNull();
    const cobros = screen.getAllByTestId('cobro-de-factura');
    expect(cobros).toHaveLength(2);
    expect(cobros[0]).toHaveTextContent('04/10/2026');
    expect(cobros[0]).toHaveTextContent('60,00');
    expect(cobros[0]).toHaveTextContent(t('cobros.formas.bizum'));
    expect(cobros[0]).toHaveTextContent('Ref-9');
    expect(cobros[1]).toHaveTextContent('15,00');
    expect(cobros[1]).toHaveTextContent(t('cobros.formas.efectivo'));
    expect(within(cobros[1]).getByText(tCon('cobros.facturas.devolucion', { motivo: 'Sesión cancelada' }))).toBeInTheDocument();
    expect(cobros[0]).not.toHaveTextContent(/devoluci/i);
  });

  it('CA12: ningún control que edite y ninguna palabra de estado de pago del programa', () => {
    pintar({
      cobros: [{ id: 'c1', importeCentimos: 12000, fecha: '2026-10-04', formaPago: 'tarjeta', referencia: null, motivo: null }],
    });
    // La fila es el primer listitem; los cobros son listitems anidados.
    const fila = screen.getAllByRole('listitem')[0];
    expect(within(fila).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(fila).queryAllByRole('spinbutton')).toHaveLength(0);
    expect(within(fila).queryAllByRole('button')).toHaveLength(0);
    expect(fila.querySelectorAll('input, select, textarea, [contenteditable]')).toHaveLength(0);
    // Aunque lo cobrado cuadre con el total, la app no dice «pagada»: eso lo sabe el programa (ADR-077).
    expect(fila.textContent).not.toMatch(/pagad|cobrad[ao] (por completo|del todo)|estado|pendiente|vencid|abonad/i);
  });

  it('ADR-078: ningún verbo de factura en la fila', () => {
    pintar();
    expect(screen.getByRole('listitem').textContent).not.toMatch(/\b(emitir|facturar|expedir|aprobar|crear factura|verifactu)\b/i);
  });

  it('monta las acciones con la factura y el paciente, y la zona', () => {
    pintar({ cobrosSinFactura: 2 });
    expect(screen.getByTestId('acciones')).toBeInTheDocument();
    expect(acciones.props[0]).toMatchObject({
      factura: { id: BASE.id, numero: 'F-2026-0007', pacienteId: BASE.pacienteId, paciente: 'Pérez Gil, Lucía' },
      cobrosSinFactura: 2,
      zona: 'Europe/Madrid',
      hoy: '2026-10-16',
    });
  });

  it('un paciente fusionado se ve, pero sin acciones nuevas (ADR-031)', () => {
    pintar({ fusionado: true, cobrosSinFactura: 3 });
    expect(screen.getByRole('listitem')).toHaveTextContent('F-2026-0007');
    expect(screen.queryByTestId('acciones')).toBeNull();
  });
});
