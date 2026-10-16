import { render, screen } from '@testing-library/react';
import { Suspense, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

const cargarContexto = vi.fn();
const cargarOpcionesProfesional = vi.fn();
const cargarPacientesParaCobro = vi.fn();
vi.mock('./datos', () => ({
  cargarContexto: (...a: unknown[]) => cargarContexto(...a),
  cargarOpcionesProfesional: (...a: unknown[]) => cargarOpcionesProfesional(...a),
  cargarPacientesParaCobro: (...a: unknown[]) => cargarPacientesParaCobro(...a),
  cargarPendientes: vi.fn(),
  cargarCobrosRecientes: vi.fn(),
}));
vi.mock('./bloques', async (original) => ({
  ...(await original<typeof import('./bloques')>()),
  BloqueMetrica: () => null,
  BloquePendientes: () => null,
  BloqueCobros: () => null,
}));
vi.mock('./bloque-facturas', () => ({ BloqueFacturas: () => null }));
// Los dos clientes, de pega: aquí solo importa si se montan y con qué.
vi.mock('./selector-profesional', () => ({
  SelectorProfesional: ({ opciones }: { opciones: { id: string; nombre: string }[] }) => (
    <button type="button" role="combobox" aria-label="Profesional" aria-controls="lista" aria-expanded={false}>
      {opciones.map((o) => o.nombre).join(',')}
    </button>
  ),
}));
vi.mock('./registrar-cobro', () => ({ RegistrarCobro: () => null }));

const { BloqueCobros, BloqueMetrica, BloquePendientes } = await import('./bloques');
const { BloqueFacturas } = await import('./bloque-facturas');
const { RegistrarCobro } = await import('./registrar-cobro');
const { default: PaginaFacturacion } = await import('./page');

const PARAMETROS = Promise.resolve({ profesional: '1b2c3d4e-5f60-4a71-8b82-9c0d1e2f3a40' });

type Nodo = { tipo: unknown; props: Record<string, unknown>; dentroDeSuspense: boolean };

/** Los elementos del árbol en orden de documento, cada uno sabiendo si tiene un `Suspense` encima. */
function elementos(nodo: ReactNode, salida: Nodo[] = [], enSuspense = false): Nodo[] {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) elementos(hijo, salida, enSuspense);
  } else if (isValidElement<Record<string, unknown> & { children?: ReactNode }>(nodo)) {
    salida.push({ tipo: nodo.type, props: nodo.props, dentroDeSuspense: enSuspense });
    const suspense = enSuspense || nodo.type === Suspense;
    elementos(nodo.props.children, salida, suspense);
    // La acción del encabezado va en una prop, no en `children`.
    if (isValidElement(nodo.props.accion)) elementos(nodo.props.accion as ReactNode, salida, suspense);
  }
  return salida;
}

function porNombre(nombre: string) {
  const nodo = elementos(PaginaFacturacion({ searchParams: PARAMETROS })).find(
    (n) => typeof n.tipo === 'function' && n.tipo.name === nombre,
  );
  if (!nodo) throw new Error(`No está ${nombre} en la página`);
  return nodo;
}

const contextoDe = (rol: string) => ({
  rol,
  profesionalFiltrado: rol === 'administrador' ? '1b2c3d4e-5f60-4a71-8b82-9c0d1e2f3a40' : null,
  zona: 'Europe/Madrid',
  hoy: '2026-10-06',
});

beforeEach(() => {
  cargarContexto.mockReset();
  cargarOpcionesProfesional.mockReset().mockResolvedValue({ ok: true, opciones: [{ id: 'x', nombre: 'Laura Gil' }] });
  cargarPacientesParaCobro.mockReset().mockResolvedValue({ ok: true, pacientes: [{ id: 'p', nombre: 'Ana', apellidos: 'Ruiz' }] });
});

describe('PaginaFacturacion', () => {
  it('los tres bloques van cada uno dentro de un Suspense, con la promesa de searchParams sin esperar', () => {
    for (const bloque of [BloqueMetrica, BloquePendientes, BloqueCobros]) {
      const nodo = elementos(PaginaFacturacion({ searchParams: PARAMETROS })).find((n) => n.tipo === bloque);
      expect(nodo?.dentroDeSuspense).toBe(true);
      expect(nodo?.props.searchParams).toBe(PARAMETROS);
    }
  });

  it('T-023b: las facturas van en su propio marco, a ancho completo tras la rejilla, y su bloque dentro de un Suspense', () => {
    const arbol = elementos(PaginaFacturacion({ searchParams: PARAMETROS }));
    const bloque = arbol.find((n) => n.tipo === BloqueFacturas);
    expect(bloque?.dentroDeSuspense).toBe(true);
    expect(bloque?.props.searchParams).toBe(PARAMETROS);

    const marco = arbol.find((n) => n.props.id === 'facturacion-facturas');
    expect(marco?.props.titulo).toBe(t('cobros.facturas.titulo'));

    // Fuera de la rejilla de dos columnas: es una lista ancha, con formulario y paginación.
    const rejilla = arbol.find((n) => typeof n.props.className === 'string' && n.props.className.includes('lg:grid-cols-2'));
    const dentroDeLaRejilla = elementos(rejilla?.props.children as ReactNode).map((n) => n.props.id);
    expect(dentroDeLaRejilla).toContain('facturacion-pendientes');
    expect(dentroDeLaRejilla).not.toContain('facturacion-facturas');
    expect(arbol.indexOf(marco!)).toBeGreaterThan(arbol.indexOf(rejilla!));
  });

  it('T-027: un enlace estático «Bonos», fuera de todo Suspense', () => {
    const enlace = elementos(PaginaFacturacion({ searchParams: PARAMETROS })).find(
      (n) => n.props.href === '/facturacion/bonos',
    );
    expect(enlace?.dentroDeSuspense).toBe(false);
    expect(enlace?.props.children).toBe(t('facturacion.enlaceBonos'));
  });

  it.each(['profesional_sanitario', 'tecnico_administrativo'])(
    'para %s no hay selector de profesional, ni se cargan las opciones',
    async (rol) => {
      cargarContexto.mockResolvedValue(contextoDe(rol));
      const nodo = porNombre('SelectorSiAdministrador');
      expect(nodo.dentroDeSuspense).toBe(true);

      const tipo = nodo.tipo as (p: Record<string, unknown>) => Promise<ReactNode>;
      render(<>{await tipo(nodo.props)}</>);

      expect(screen.queryByRole('combobox', { name: /profesional/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /profesional/i })).toBeNull();
      expect(cargarOpcionesProfesional).not.toHaveBeenCalled();
    },
  );

  it('para el administrador, el selector con las opciones y el filtro elegido', async () => {
    cargarContexto.mockResolvedValue(contextoDe('administrador'));
    const nodo = porNombre('SelectorSiAdministrador');
    const tipo = nodo.tipo as (p: Record<string, unknown>) => Promise<ReactNode>;

    render(<>{await tipo(nodo.props)}</>);

    expect(screen.getByRole('combobox', { name: /profesional/i })).toHaveTextContent('Laura Gil');
    expect(cargarOpcionesProfesional).toHaveBeenCalledTimes(1);
    expect(cargarOpcionesProfesional).toHaveBeenCalledWith('1b2c3d4e-5f60-4a71-8b82-9c0d1e2f3a40');
  });

  it('A-H3 / R4.5: con filtro y sin lista de profesionales, el aviso con filtro y el enlace a todos', async () => {
    cargarContexto.mockResolvedValue(contextoDe('administrador'));
    cargarOpcionesProfesional.mockResolvedValue({ ok: false });
    const nodo = porNombre('SelectorSiAdministrador');
    const tipo = nodo.tipo as (p: Record<string, unknown>) => Promise<ReactNode>;

    render(<>{await tipo(nodo.props)}</>);

    expect(screen.getByText(t('cobros.errorProfesionalesConFiltro'))).toBeInTheDocument();
    expect(screen.queryByText(t('cobros.errorProfesionales'))).toBeNull();
    expect(screen.queryByRole('combobox', { name: /profesional/i })).toBeNull();
    const enlace = screen.getByRole('link', { name: t('cobros.verTodosLosProfesionales') });
    expect(enlace).toHaveAttribute('href', '/facturacion');
    expect(enlace.className).toMatch(/min-h-11/);
  });

  it('gemela: sin filtro y sin lista de profesionales, el aviso de siempre y ningún enlace', async () => {
    cargarContexto.mockResolvedValue({ ...contextoDe('administrador'), profesionalFiltrado: null });
    cargarOpcionesProfesional.mockResolvedValue({ ok: false });
    const nodo = porNombre('SelectorSiAdministrador');
    const tipo = nodo.tipo as (p: Record<string, unknown>) => Promise<ReactNode>;

    render(<>{await tipo(nodo.props)}</>);

    expect(screen.getByText(t('cobros.errorProfesionales'))).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('combobox', { name: /profesional/i })).toBeNull();
  });

  it('si no se pueden cargar los pacientes, la isla se monta igual, con pacientes null', async () => {
    cargarContexto.mockResolvedValue(contextoDe('tecnico_administrativo'));
    cargarPacientesParaCobro.mockResolvedValue({ ok: false });
    const nodo = porNombre('AccionRegistrar');
    const tipo = nodo.tipo as (p: Record<string, unknown>) => Promise<ReactNode>;

    const r = await tipo(nodo.props);

    expect(isValidElement(r) && r.type).toBe(RegistrarCobro);
    expect(isValidElement(r) && r.props).toEqual({ pacientes: null, hoy: '2026-10-06' });
  });

  it('el botón de registrar cobro recibe los pacientes y el hoy del contexto, dentro de un Suspense', async () => {
    cargarContexto.mockResolvedValue(contextoDe('tecnico_administrativo'));
    const nodo = porNombre('AccionRegistrar');
    expect(nodo.dentroDeSuspense).toBe(true);

    const tipo = nodo.tipo as (p: Record<string, unknown>) => Promise<ReactNode>;
    const resultado = await tipo(nodo.props);

    expect(isValidElement(resultado) && resultado.type).toBe(RegistrarCobro);
    expect(isValidElement(resultado) && resultado.props).toEqual({
      pacientes: [{ id: 'p', nombre: 'Ana', apellidos: 'Ruiz' }],
      hoy: '2026-10-06',
    });
  });
});
