import { render, screen } from '@testing-library/react';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// T-026a · Ajustes › Programa de facturación: quién la ve, qué enseña sin programa disponible y
// que el enlace de Ajustes solo sale para el administrador.

const rpc = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({
  exigirSesion: async () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) }, usuario: { id: 'u1' } }),
}));

const estadoDeCuenta = vi.fn();
vi.mock('@/lib/cuentas/candado', () => ({ estadoDeCuenta: (...a: unknown[]) => estadoDeCuenta(...a) }));

const redirect = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`);
});
vi.mock('next/navigation', () => ({ redirect: (d: string) => redirect(d) }));

vi.mock('./acciones', () => ({
  guardarClaveProveedor: vi.fn(),
  probarConexion: vi.fn(),
  desconectarProveedor: vi.fn(),
}));

const FICHA = {
  id: 'holded' as const,
  nombre: 'Programa X',
  disponible: true,
  enlaceDeBorrador: () => null,
};
const registro = vi.hoisted(() => ({ FICHAS: {} as Record<string, unknown> }));
vi.mock('@/lib/facturacion/registro', () => registro);

const { default: PaginaPrograma } = await import('./page');
const { default: PaginaAjustes } = await import('../page');

/** Busca por nombre un componente de función en el árbol, sin renderizar. */
function buscar(nodo: ReactNode, nombre: string): ReactElement | null {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const r = buscar(hijo, nombre);
      if (r) return r;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(nodo)) return null;
  if (typeof nodo.type === 'function' && nodo.type.name === nombre) return nodo;
  return buscar(nodo.props.children, nombre);
}

async function resolver(arbol: ReactNode, nombre: string) {
  const el = buscar(arbol, nombre);
  if (!el) throw new Error(`No está ${nombre}`);
  return (el.type as (p: unknown) => Promise<ReactNode>)(el.props);
}

beforeEach(() => {
  vi.clearAllMocks();
  estadoDeCuenta.mockResolvedValue({ rol: 'administrador' });
  registro.FICHAS = { holded: FICHA };
  rpc.mockResolvedValue({ data: [], error: null });
});

describe('Ajustes › Programa de facturación', () => {
  it('sin ninguna ficha disponible dice solo eso: ni campo ni botones', async () => {
    registro.FICHAS = { holded: { ...FICHA, disponible: false } };
    render(<>{await resolver(PaginaPrograma(), 'CargaDelPrograma')}</>);

    expect(
      screen.getByText('Todavía no hay ningún programa de facturación disponible para conectar'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Clave de acceso/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('con programa disponible y sin conectar pinta el campo de contraseña y ningún botón extra', async () => {
    render(<>{await resolver(PaginaPrograma(), 'CargaDelPrograma')}</>);

    expect(screen.getByText('Sin programa conectado')).toBeInTheDocument();
    expect(screen.getByLabelText('Clave de acceso de Programa X')).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('button', { name: 'Probar conexión' })).toBeNull();
  });

  it('conectado enseña los cuatro últimos caracteres y la fecha, nada más', async () => {
    rpc.mockResolvedValue({
      data: [{ proveedor: 'holded', ultimos4: '••••wxyz', actualizado_en: '2026-10-07T12:00:00Z' }],
      error: null,
    });
    render(<>{await resolver(PaginaPrograma(), 'CargaDelPrograma')}</>);

    expect(
      screen.getByText('Programa X conectado · clave ••••wxyz · actualizada el 7 de octubre de 2026'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Probar conexión' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeInTheDocument();
  });

  it.each(['profesional_sanitario', 'tecnico_administrativo'])('%s es redirigido a /ajustes', async (rol) => {
    estadoDeCuenta.mockResolvedValue({ rol });
    await expect(resolver(PaginaPrograma(), 'CargaDelPrograma')).rejects.toThrow('REDIRECT:/ajustes');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('Ajustes › el enlace', () => {
  it('sale para el administrador, después de «Altas de centro»', async () => {
    render(<>{await resolver(PaginaAjustes(), 'AccesosDeAdministracion')}</>);
    const enlaces = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(enlaces).toContain('/ajustes/facturacion');
    expect(enlaces.indexOf('/ajustes/facturacion')).toBe(enlaces.indexOf('/ajustes/centros') + 1);
  });

  it.each(['profesional_sanitario', 'tecnico_administrativo'])('%s no recibe el bloque', async (rol) => {
    estadoDeCuenta.mockResolvedValue({ rol });
    expect(await resolver(PaginaAjustes(), 'AccesosDeAdministracion')).toBeNull();
  });
});
