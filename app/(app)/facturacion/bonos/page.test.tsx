import { render, screen, within } from '@testing-library/react';
import { Suspense, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

import { leerBono } from './estado';

const cargarContextoBonos = vi.fn();
const cargarBonos = vi.fn();
const cargarProfesionalesDeBonos = vi.fn();
const cargarPacientesParaCobro = vi.fn();
vi.mock('./datos', () => ({
  cargarContextoBonos: (...a: unknown[]) => cargarContextoBonos(...a),
  cargarBonos: (...a: unknown[]) => cargarBonos(...a),
  cargarProfesionalesDeBonos: (...a: unknown[]) => cargarProfesionalesDeBonos(...a),
}));
vi.mock('../datos', () => ({ cargarPacientesParaCobro: (...a: unknown[]) => cargarPacientesParaCobro(...a) }));
vi.mock('./registrar-bono', () => ({
  RegistrarBono: () => (
    <button type="button" data-testid="registrar">
      Registrar bono
    </button>
  ),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

const { default: PaginaBonos } = await import('./page');

const PARAMETROS = Promise.resolve({});
const HOY = '2026-10-14';
const PRO = 'b0000000-0000-4000-8000-000000000001';

function bono(id: string, paciente: string, nombre: string, totales: number, consumidas: number, caducidad: string | null = null) {
  return {
    bonoId: id,
    pacienteId: paciente,
    nombre,
    apellidos: 'Ruiz',
    profesionalId: PRO,
    sesionesTotales: totales,
    sesionesConsumidas: consumidas,
    caducidad,
    importe: 15000,
    creadoEn: '2026-10-01T10:00:00Z',
    lectura: leerBono({ sesionesTotales: totales, sesionesConsumidas: consumidas, caducidad }, HOY),
  };
}

const contexto = (rol: string, extra: Record<string, unknown> = {}) => ({
  rol,
  hoy: HOY,
  zona: 'Europe/Madrid',
  estado: null,
  profesional: null,
  paciente: null,
  pagina: 1,
  ...extra,
});

type Nodo = { tipo: unknown; props: Record<string, unknown>; dentroDeSuspense: boolean };

function elementos(nodo: ReactNode, salida: Nodo[] = [], enSuspense = false): Nodo[] {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) elementos(hijo, salida, enSuspense);
  } else if (isValidElement<Record<string, unknown> & { children?: ReactNode }>(nodo)) {
    salida.push({ tipo: nodo.type, props: nodo.props, dentroDeSuspense: enSuspense });
    const suspense = enSuspense || nodo.type === Suspense;
    elementos(nodo.props.children, salida, suspense);
    if (isValidElement(nodo.props.accion)) elementos(nodo.props.accion as ReactNode, salida, suspense);
  }
  return salida;
}

async function pintarLista() {
  const nodo = elementos(PaginaBonos({ searchParams: PARAMETROS })).find(
    (n) => typeof n.tipo === 'function' && n.tipo.name === 'ListaDeBonos',
  );
  if (!nodo) throw new Error('No está ListaDeBonos en la página');
  expect(nodo.dentroDeSuspense).toBe(true);
  const tipo = nodo.tipo as (p: Record<string, unknown>) => Promise<ReactNode>;
  render(<>{await tipo(nodo.props)}</>);
}

beforeEach(() => {
  cargarContextoBonos.mockReset();
  cargarBonos.mockReset().mockResolvedValue({
    ok: true,
    bonos: [bono('1', 'p1', 'Ana', 5, 3), bono('2', 'p2', 'Luis', 4, 4), bono('3', 'p3', 'Eva', 3, 1, '2026-09-01')],
  });
  cargarProfesionalesDeBonos.mockReset().mockResolvedValue({ ok: true, opciones: [{ id: PRO, nombre: 'Laura Gil' }] });
  cargarPacientesParaCobro.mockReset().mockResolvedValue({ ok: true, pacientes: [] });
});

describe('PaginaBonos', () => {
  it('la cabecera no espera a nadie: el botón y la lista van cada uno en su Suspense', () => {
    const todos = elementos(PaginaBonos({ searchParams: PARAMETROS }));
    const lista = todos.find((n) => typeof n.tipo === 'function' && n.tipo.name === 'ListaDeBonos');
    const accion = todos.find((n) => typeof n.tipo === 'function' && n.tipo.name === 'AccionRegistrar');
    expect(lista?.dentroDeSuspense).toBe(true);
    expect(accion?.dentroDeSuspense).toBe(true);
    expect(lista?.props.searchParams).toBe(PARAMETROS);
  });

  it('el enlace de vuelta a Facturación', () => {
    render(<>{PaginaBonos({ searchParams: PARAMETROS })}</>);
    expect(screen.getByRole('link', { name: t('bonos.volver') })).toHaveAttribute('href', '/facturacion');
  });

  it('administrador: tres selectores (estado, profesional y paciente) en un formulario GET', async () => {
    cargarContextoBonos.mockResolvedValue(contexto('administrador'));
    await pintarLista();
    const formulario = screen.getByRole('form', { name: t('bonos.filtros.nombre') });
    expect(formulario).toHaveAttribute('method', 'get');
    expect(formulario).toHaveAttribute('action', '/facturacion/bonos');
    expect(within(formulario).getAllByRole('combobox')).toHaveLength(3);
    expect(screen.getByLabelText(t('bonos.filtros.profesional'))).toHaveTextContent('Laura Gil');
    expect(screen.getByLabelText(t('bonos.filtros.paciente'))).toHaveTextContent('Ana Ruiz');
    expect(cargarProfesionalesDeBonos).toHaveBeenCalledTimes(1);
  });

  it.each(['profesional_sanitario', 'tecnico_administrativo'])(
    '%s: solo el selector de estado, y no se leen los profesionales',
    async (rol) => {
      cargarContextoBonos.mockResolvedValue(contexto(rol));
      await pintarLista();
      expect(screen.getAllByRole('combobox')).toHaveLength(1);
      expect(screen.getByLabelText(t('bonos.filtros.estado'))).toBeInTheDocument();
      expect(screen.queryByLabelText(t('bonos.filtros.profesional'))).toBeNull();
      expect(screen.queryByLabelText(t('bonos.filtros.paciente'))).toBeNull();
      expect(cargarProfesionalesDeBonos).not.toHaveBeenCalled();
    },
  );

  it('cada bono con su estado, sus sesiones usadas, lo que queda, el importe y la caducidad', async () => {
    cargarContextoBonos.mockResolvedValue(contexto('administrador'));
    await pintarLista();
    const filas = screen.getAllByRole('listitem');
    expect(filas).toHaveLength(3);
    const ana = filas.find((f) => within(f).queryByText('Ana Ruiz'))!;
    expect(within(ana).getByText(t('bonos.estado.vigente'))).toBeInTheDocument();
    expect(ana).toHaveTextContent('3 de 5 sesiones usadas');
    expect(ana).toHaveTextContent('Quedan 2 sesiones');
    expect(ana).toHaveTextContent('Sin caducidad');
    expect(ana).toHaveTextContent('150,00');
    const luis = filas.find((f) => within(f).queryByText('Luis Ruiz'))!;
    expect(within(luis).getByText(t('bonos.estado.agotado'))).toBeInTheDocument();
    expect(luis).toHaveTextContent('No quedan sesiones');
    const eva = filas.find((f) => within(f).queryByText('Eva Ruiz'))!;
    expect(within(eva).getByText(t('bonos.estado.caducado'))).toBeInTheDocument();
    expect(eva).toHaveTextContent('Caduca el 01/09/2026');
  });

  it('las sesiones hechas de más se señalan', async () => {
    cargarContextoBonos.mockResolvedValue(contexto('administrador'));
    cargarBonos.mockResolvedValue({ ok: true, bonos: [bono('1', 'p1', 'Ana', 3, 5)] });
    await pintarLista();
    expect(screen.getByText('Se han hecho 2 sesiones más de las del bono.')).toBeInTheDocument();
  });

  it('el filtro de estado estrecha la lista', async () => {
    cargarContextoBonos.mockResolvedValue(contexto('administrador', { estado: 'agotado' }));
    await pintarLista();
    const filas = screen.getAllByRole('listitem');
    expect(filas).toHaveLength(1);
    expect(within(filas[0]).getByText('Luis Ruiz')).toBeInTheDocument();
  });

  it('un ?profesional o ?paciente que ya no está entre las opciones no filtra en silencio', async () => {
    const AUSENTE = 'c0000000-0000-4000-8000-0000000000ff';
    cargarContextoBonos.mockResolvedValue(contexto('administrador', { profesional: AUSENTE }));
    await pintarLista();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByLabelText(t('bonos.filtros.profesional'))).toHaveValue('');
  });

  it('un ?paciente ausente de las opciones tampoco filtra', async () => {
    cargarContextoBonos.mockResolvedValue(contexto('administrador', { paciente: 'c0000000-0000-4000-8000-0000000000ff' }));
    await pintarLista();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByLabelText(t('bonos.filtros.paciente'))).toHaveValue('');
  });

  it('si falla el directorio de profesionales, el ?profesional de la URL no se aplica a ciegas', async () => {
    cargarContextoBonos.mockResolvedValue(contexto('administrador', { profesional: 'c0000000-0000-4000-8000-0000000000ff' }));
    cargarProfesionalesDeBonos.mockResolvedValue({ ok: false });
    await pintarLista();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('un filtro que sí está entre las opciones sigue estrechando', async () => {
    cargarContextoBonos.mockResolvedValue(contexto('administrador', { paciente: 'p2' }));
    await pintarLista();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('ninguna fila lleva botones ni enlaces, y no hay nada de facturar', async () => {
    cargarContextoBonos.mockResolvedValue(contexto('administrador'));
    await pintarLista();
    for (const fila of screen.getAllByRole('listitem')) {
      expect(within(fila).queryByRole('button')).toBeNull();
      expect(within(fila).queryByRole('link')).toBeNull();
    }
    expect(screen.queryByText(/factur/i)).toBeNull();
  });

  it('sin bonos: el estado vacío con su explicación', async () => {
    cargarContextoBonos.mockResolvedValue(contexto('profesional_sanitario'));
    cargarBonos.mockResolvedValue({ ok: true, bonos: [] });
    await pintarLista();
    expect(screen.getByText(t('bonos.vacio'))).toBeInTheDocument();
    expect(screen.getByText(t('bonos.vacioExplicacion'))).toBeInTheDocument();
  });

  it('si la lectura falla: aviso, no una lista vacía que parezca verdad', async () => {
    cargarContextoBonos.mockResolvedValue(contexto('administrador'));
    cargarBonos.mockResolvedValue({ ok: false });
    await pintarLista();
    expect(screen.getByText(t('bonos.errorBonos'))).toBeInTheDocument();
    expect(screen.queryByText(t('bonos.vacio'))).toBeNull();
  });

  it('con más de 50 bonos, la paginación con su nombre y enlaces que conservan el filtro', async () => {
    cargarContextoBonos.mockResolvedValue(contexto('profesional_sanitario', { estado: 'vigente' }));
    cargarBonos.mockResolvedValue({
      ok: true,
      bonos: Array.from({ length: 120 }, (_, i) => bono(`b${i}`, `p${i}`, `N${String(i).padStart(3, '0')}`, 5, 1)),
    });
    await pintarLista();
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    expect(screen.getByRole('navigation', { name: t('bonos.paginacion.nombre') })).toBeInTheDocument();
    expect(screen.getByText('Del 1 al 50 de 120')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('cobros.paginacion.siguientes') })).toHaveAttribute(
      'href',
      '/facturacion/bonos?estado=vigente&pagina=2',
    );
  });
});
