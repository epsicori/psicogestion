import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t, tCon } from '@/lib/i18n';

import { leerFiltrosFacturas } from './filtros-facturas';

const cargarContexto = vi.fn();
const cargarFacturas = vi.fn();
vi.mock('./datos', () => ({
  TAMANO_PAGINA_FACTURAS: 20,
  cargarContexto: (...a: unknown[]) => cargarContexto(...a),
  cargarFacturas: (...a: unknown[]) => cargarFacturas(...a),
}));

// `next/form` necesita el contexto del enrutador; aquí solo importa que sea un <form> GET a /facturacion.
vi.mock('next/form', () => ({
  default: ({ action, children, ...resto }: { action: string; children: ReactNode }) => (
    <form data-action={action} {...resto}>
      {children}
    </form>
  ),
}));

// La fila tiene su propia prueba: aquí solo se comprueba qué facturas se le dan.
vi.mock('./fila-factura', () => ({
  FilaFactura: ({ factura }: { factura: { id: string; numero: string } }) => (
    <li data-testid="fila">{factura.numero}</li>
  ),
}));

const { BloqueFacturas } = await import('./bloque-facturas');

const PARAMETROS = Promise.resolve({});
const PRO = '1b2c3d4e-5f60-4a71-8b82-9c0d1e2f3a40';
const HOY = '2026-10-16';

function contexto(parametros: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
  return {
    rol: 'administrador',
    profesionalFiltrado: null,
    pagina: 1,
    zona: 'Europe/Madrid',
    hoy: HOY,
    filtrosFacturas: leerFiltrosFacturas(parametros, HOY),
    ...extra,
  };
}

function factura(n: number) {
  return {
    id: `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    pacienteId: 'p',
    nombre: 'Ana',
    apellidos: 'Ruiz',
    fusionado: false,
    programa: 'Holded',
    numero: `F-2026-${String(n).padStart(4, '0')}`,
    fecha: '2026-10-03',
    totalCentimos: 1000,
    url: null,
    cobros: [],
    cobrosSinFactura: 0,
  };
}

const respuesta = (n: number, total = n, pagina = 1) => ({
  ok: true,
  facturas: Array.from({ length: n }, (_, i) => factura(i + 1)),
  total,
  pagina,
});

async function pintar() {
  render(<>{await BloqueFacturas({ searchParams: PARAMETROS })}</>);
}

beforeEach(() => {
  cargarContexto.mockReset().mockResolvedValue(contexto());
  cargarFacturas.mockReset().mockResolvedValue(respuesta(2));
});

describe('BloqueFacturas', () => {
  it('pide las facturas con los filtros del contexto y el profesional filtrado, y pinta una fila por factura', async () => {
    cargarContexto.mockResolvedValue(contexto({ forma: 'bizum' }, { profesionalFiltrado: PRO }));
    await pintar();
    expect(cargarFacturas).toHaveBeenCalledWith(
      expect.objectContaining({ desde: '2026-08-01', hasta: HOY, formaPago: 'bizum' }),
      PRO,
    );
    expect(screen.getAllByTestId('fila').map((f) => f.textContent)).toEqual(['F-2026-0001', 'F-2026-0002']);
  });

  it('el formulario es un GET a /facturacion con Desde, Hasta y Forma de pago, con los valores vigentes', async () => {
    cargarContexto.mockResolvedValue(contexto({ desde: '2026-09-01', hasta: '2026-09-30', forma: 'efectivo' }));
    await pintar();
    const formulario = screen.getByRole('form', { name: t('cobros.facturas.filtrar') });
    expect(formulario).toHaveAttribute('data-action', '/facturacion');
    const desde = within(formulario).getByLabelText(t('cobros.facturas.desde')) as HTMLInputElement;
    const hasta = within(formulario).getByLabelText(t('cobros.facturas.hasta')) as HTMLInputElement;
    const forma = within(formulario).getByLabelText(t('cobros.facturas.formaPago')) as HTMLSelectElement;
    expect([desde.type, desde.name, desde.value]).toEqual(['date', 'desde', '2026-09-01']);
    expect([hasta.type, hasta.name, hasta.value]).toEqual(['date', 'hasta', '2026-09-30']);
    expect(forma.name).toBe('forma');
    expect(forma.value).toBe('efectivo');
    expect(within(formulario).getByRole('button', { name: t('cobros.facturas.filtrar') })).toBeInTheDocument();
  });

  it('CA13: la forma de pago ofrece «Todas» y las cinco formas; no hay filtro por estado de cobro', async () => {
    await pintar();
    const forma = screen.getByLabelText(t('cobros.facturas.formaPago'));
    const opciones = within(forma).getAllByRole('option').map((o) => [o.getAttribute('value'), o.textContent]);
    expect(opciones).toEqual([
      ['', t('cobros.facturas.todas')],
      ['efectivo', t('cobros.formas.efectivo')],
      ['transferencia', t('cobros.formas.transferencia')],
      ['tarjeta', t('cobros.formas.tarjeta')],
      ['bizum', t('cobros.formas.bizum')],
      ['otro', t('cobros.formas.otro')],
    ]);
    const formulario = screen.getByRole('form', { name: t('cobros.facturas.filtrar') });
    expect(within(formulario).getAllByRole('combobox')).toHaveLength(1);
    expect(formulario.textContent).not.toMatch(/estado|pagada|pendiente|vencid/i);
  });

  it('el filtro de profesional del administrador viaja oculto en el formulario; sin él, no hay campo', async () => {
    cargarContexto.mockResolvedValue(contexto({}, { profesionalFiltrado: PRO }));
    await pintar();
    const oculto = screen.getByRole('form', { name: t('cobros.facturas.filtrar') }).querySelector('input[name="profesional"]');
    expect(oculto).toHaveAttribute('type', 'hidden');
    expect(oculto).toHaveAttribute('value', PRO);
  });

  it('sin filtro de profesional no hay campo oculto', async () => {
    await pintar();
    expect(screen.getByRole('form', { name: t('cobros.facturas.filtrar') }).querySelector('input[name="profesional"]')).toBeNull();
  });

  it.each([
    [{ desde: '2026-02-30' }, 'desde'],
    [{ hasta: 'ayer' }, 'hasta'],
    [{ forma: 'cheque' }, 'forma'],
    [{ desde: '2026-10-10', hasta: '2026-09-01' }, 'rango'],
  ] as const)('un filtro que no vale (%j) no se aplica en silencio: avisa «%s»', async (parametros, aviso) => {
    cargarContexto.mockResolvedValue(contexto({ ...parametros }));
    await pintar();
    expect(screen.getByText(t(`cobros.facturas.filtroNoAplicado.${aviso}`))).toBeInTheDocument();
  });

  it('con filtros válidos o vacíos no hay avisos', async () => {
    cargarContexto.mockResolvedValue(contexto({ desde: '', forma: 'bizum' }));
    await pintar();
    expect(screen.queryByText(/se usa la de siempre|se usan las de siempre|se muestran todas/)).toBeNull();
  });

  it('sin facturas: estado vacío con su explicación, y el formulario sigue ahí para cambiar el filtro', async () => {
    cargarFacturas.mockResolvedValue(respuesta(0));
    await pintar();
    expect(screen.getByText(t('cobros.facturas.vacio'))).toBeInTheDocument();
    expect(screen.getByText(t('cobros.facturas.vacioExplicacion'))).toBeInTheDocument();
    expect(screen.getByRole('form', { name: t('cobros.facturas.filtrar') })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('si la carga falla: aviso de error, ninguna fila, y el formulario sigue ahí', async () => {
    cargarFacturas.mockResolvedValue({ ok: false });
    await pintar();
    expect(screen.getByRole('alert')).toHaveTextContent(t('cobros.facturas.error'));
    expect(screen.queryByTestId('fila')).toBeNull();
    expect(screen.getByRole('form', { name: t('cobros.facturas.filtrar') })).toBeInTheDocument();
  });

  it('con una sola página no hay paginación', async () => {
    cargarFacturas.mockResolvedValue(respuesta(20, 20));
    await pintar();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  describe('paginación', () => {
    const enlaces = (nav: HTMLElement) =>
      within(nav).queryAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]);

    it('página 2 de 3: rango, «Anteriores» y «Siguientes»; los enlaces conservan filtros y la página del pendiente', async () => {
      cargarContexto.mockResolvedValue(
        contexto({ desde: '2026-09-01', forma: 'bizum' }, { profesionalFiltrado: PRO, pagina: 4 }),
      );
      cargarFacturas.mockResolvedValue(respuesta(20, 45, 2));
      await pintar();
      const nav = screen.getByRole('navigation', { name: t('cobros.facturas.paginacion') });
      expect(within(nav).getByText(tCon('cobros.facturas.rango', { desde: 21, hasta: 40, total: 45 }))).toBeInTheDocument();
      const [anteriores, siguientes] = enlaces(nav);
      const q = (href: string | null) => new URLSearchParams((href ?? '').split('?')[1]);
      expect(anteriores[0]).toBe(t('cobros.paginacion.anteriores'));
      expect(Object.fromEntries(q(anteriores[1]))).toEqual({
        profesional: PRO,
        pagina: '4',
        desde: '2026-09-01',
        forma: 'bizum',
      });
      expect(siguientes[0]).toBe(t('cobros.paginacion.siguientes'));
      expect(q(siguientes[1]).get('paginaFacturas')).toBe('3');
      expect(q(siguientes[1]).get('forma')).toBe('bizum');
      expect(q(siguientes[1]).get('pagina')).toBe('4');
    });

    it('la última página no ofrece «Siguientes»', async () => {
      cargarFacturas.mockResolvedValue(respuesta(5, 45, 3));
      await pintar();
      const nav = screen.getByRole('navigation', { name: t('cobros.facturas.paginacion') });
      expect(enlaces(nav).map((e) => e[0])).toEqual([t('cobros.paginacion.anteriores')]);
      expect(within(nav).getByText(tCon('cobros.facturas.rango', { desde: 41, hasta: 45, total: 45 }))).toBeInTheDocument();
    });

    it('en la página 1 solo «Siguientes», con paginaFacturas=2 y nada más', async () => {
      cargarFacturas.mockResolvedValue(respuesta(20, 45, 1));
      await pintar();
      const nav = screen.getByRole('navigation', { name: t('cobros.facturas.paginacion') });
      expect(enlaces(nav)).toEqual([[t('cobros.paginacion.siguientes'), '/facturacion?paginaFacturas=2']]);
    });
  });

  it('ADR-078: ningún verbo de factura en el bloque', async () => {
    await pintar();
    expect(document.body.textContent).not.toMatch(/\b(emitir|facturar|expedir|aprobar|crear factura|verifactu)\b/i);
  });
});
