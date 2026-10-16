import { describe, expect, it } from 'vitest';

import { hrefFacturacion, leerFiltrosFacturas } from './filtros-facturas';

const HOY = '2026-10-16';
const PRO = '1b2c3d4e-5f60-4a71-8b82-9c0d1e2f3a40';

describe('leerFiltrosFacturas · valores por defecto (P3: mes actual y dos previos)', () => {
  it('sin parámetros: desde el día 1 de hace dos meses hasta hoy, sin forma y en la página 1', () => {
    expect(leerFiltrosFacturas({}, HOY)).toEqual({
      desde: '2026-08-01',
      hasta: HOY,
      formaPago: null,
      pagina: 1,
      avisos: [],
      explicitos: { desde: null, hasta: null, formaPago: null },
    });
  });

  it.each([
    ['2026-03-31', '2026-01-01'],
    ['2026-02-15', '2025-12-01'],
    ['2026-01-01', '2025-11-01'],
    ['2026-12-31', '2026-10-01'],
  ])('con hoy %s, el desde por defecto es %s (cruza el año sin saltarse un mes)', (hoy, esperado) => {
    expect(leerFiltrosFacturas({}, hoy).desde).toBe(esperado);
  });

  it('un parámetro vacío (el formulario con el campo borrado) es «sin valor», sin aviso', () => {
    const f = leerFiltrosFacturas({ desde: '', hasta: '', forma: '', paginaFacturas: '' }, HOY);
    expect(f.avisos).toEqual([]);
    expect(f.desde).toBe('2026-08-01');
    expect(f.hasta).toBe(HOY);
    expect(f.formaPago).toBeNull();
  });
});

describe('leerFiltrosFacturas · valores válidos', () => {
  it('desde, hasta y forma válidos se aplican y quedan como explícitos', () => {
    const f = leerFiltrosFacturas({ desde: '2026-09-01', hasta: '2026-09-30', forma: 'bizum' }, HOY);
    expect(f).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-30', formaPago: 'bizum', avisos: [] });
    expect(f.explicitos).toEqual({ desde: '2026-09-01', hasta: '2026-09-30', formaPago: 'bizum' });
  });

  it('desde igual a hasta es un rango válido', () => {
    expect(leerFiltrosFacturas({ desde: '2026-09-10', hasta: '2026-09-10' }, HOY).avisos).toEqual([]);
  });

  it('solo hasta, anterior al desde por defecto: el desde baja hasta el hasta y no hay aviso de rango', () => {
    const f = leerFiltrosFacturas({ hasta: '2026-01-15' }, HOY);
    expect(f.hasta).toBe('2026-01-15');
    expect(f.desde <= f.hasta).toBe(true);
    expect(f.avisos).toEqual([]);
  });

  it.each([
    ['3', 3],
    ['1', 1],
  ])('paginaFacturas=%s da la página %i', (valor, pagina) => {
    expect(leerFiltrosFacturas({ paginaFacturas: valor }, HOY).pagina).toBe(pagina);
  });
});

describe('leerFiltrosFacturas · lo inválido no se aplica en silencio', () => {
  it.each(['2026-02-30', '2026-13-01', 'ayer', '16/10/2026', '2026-1-1', '0000-00-00'])(
    'desde «%s» no se aplica y avisa',
    (desde) => {
      const f = leerFiltrosFacturas({ desde }, HOY);
      expect(f.desde).toBe('2026-08-01');
      expect(f.avisos).toEqual(['desde']);
      expect(f.explicitos.desde).toBeNull();
    },
  );

  it('hasta inválido no se aplica y avisa', () => {
    const f = leerFiltrosFacturas({ hasta: '2026-02-30' }, HOY);
    expect(f.hasta).toBe(HOY);
    expect(f.avisos).toEqual(['hasta']);
  });

  it.each(['cheque', 'EFECTIVO', 'todas'])('forma «%s» no se aplica y avisa', (forma) => {
    const f = leerFiltrosFacturas({ forma }, HOY);
    expect(f.formaPago).toBeNull();
    expect(f.avisos).toEqual(['forma']);
  });

  it('desde posterior a hasta: se usan los de siempre y avisa «rango»', () => {
    const f = leerFiltrosFacturas({ desde: '2026-10-10', hasta: '2026-09-01' }, HOY);
    expect(f.desde).toBe('2026-08-01');
    expect(f.hasta).toBe(HOY);
    expect(f.avisos).toEqual(['rango']);
    expect(f.explicitos).toEqual({ desde: null, hasta: null, formaPago: null });
  });

  it.each(['0', '-1', 'x', '1.5', '2e3'])('paginaFacturas «%s» cae en la 1', (valor) => {
    expect(leerFiltrosFacturas({ paginaFacturas: valor }, HOY).pagina).toBe(1);
  });

  it('un parámetro repetido (arreglo) es inválido, no «el primero»', () => {
    const f = leerFiltrosFacturas({ forma: ['bizum', 'otro'], desde: ['2026-09-01', '2026-09-02'] }, HOY);
    expect(f.formaPago).toBeNull();
    expect(f.desde).toBe('2026-08-01');
    expect(f.avisos).toEqual(['desde', 'forma']);
  });
});

describe('hrefFacturacion · conserva lo que ya había', () => {
  const base = { profesional: null, pagina: 1, paginaFacturas: 1, explicitos: { desde: null, hasta: null, formaPago: null } };

  it('sin nada, la ruta a secas', () => {
    expect(hrefFacturacion(base)).toBe('/facturacion');
  });

  it('el filtro de profesional y la página del pendiente se conservan al paginar facturas', () => {
    const href = hrefFacturacion({ ...base, profesional: PRO, pagina: 2, paginaFacturas: 3 });
    const q = new URLSearchParams(href.split('?')[1]);
    expect(href.startsWith('/facturacion?')).toBe(true);
    expect(q.get('profesional')).toBe(PRO);
    expect(q.get('pagina')).toBe('2');
    expect(q.get('paginaFacturas')).toBe('3');
  });

  it('los filtros explícitos de facturas se conservan al paginar el pendiente', () => {
    const href = hrefFacturacion({
      ...base,
      pagina: 2,
      explicitos: { desde: '2026-09-01', hasta: '2026-09-30', formaPago: 'bizum' },
    });
    const q = new URLSearchParams(href.split('?')[1]);
    expect(q.get('desde')).toBe('2026-09-01');
    expect(q.get('hasta')).toBe('2026-09-30');
    expect(q.get('forma')).toBe('bizum');
    expect(q.get('pagina')).toBe('2');
    expect(q.has('paginaFacturas')).toBe(false);
  });

  it('la página 1 no va en la URL', () => {
    expect(hrefFacturacion({ ...base, profesional: PRO })).toBe(`/facturacion?profesional=${PRO}`);
  });
});
