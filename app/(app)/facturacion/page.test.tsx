import { render, screen } from '@testing-library/react';
import { Suspense, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  cargarOpcionesProfesional.mockReset().mockResolvedValue([{ id: 'x', nombre: 'Laura Gil' }]);
  cargarPacientesParaCobro.mockReset().mockResolvedValue([{ id: 'p', nombre: 'Ana', apellidos: 'Ruiz' }]);
});

describe('PaginaFacturacion', () => {
  it('los tres bloques van cada uno dentro de un Suspense, con la promesa de searchParams sin esperar', () => {
    for (const bloque of [BloqueMetrica, BloquePendientes, BloqueCobros]) {
      const nodo = elementos(PaginaFacturacion({ searchParams: PARAMETROS })).find((n) => n.tipo === bloque);
      expect(nodo?.dentroDeSuspense).toBe(true);
      expect(nodo?.props.searchParams).toBe(PARAMETROS);
    }
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
