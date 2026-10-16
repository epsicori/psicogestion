import { Suspense, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/citas/agenda', () => ({ leerCitasRango: vi.fn() }));
vi.mock('@/lib/citas/densidad', () => ({ leerDensidadAnual: vi.fn(), listarProfesionalesDelAnio: vi.fn() }));
vi.mock('@/lib/citas/propuestas', () => ({ listarPropuestasPendientes: vi.fn() }));
vi.mock('./acciones', () => ({}));
vi.mock('./calendario', () => ({ Calendario: () => null }));
vi.mock('./calendario-anio', () => ({ CalendarioAnio: () => null }));
vi.mock('./cuadro', () => ({ Cuadro: () => null }));
vi.mock('./datos', () => ({ cargarContexto: vi.fn() }));
vi.mock('./documentacion', () => ({ Documentacion: () => null }));
vi.mock('./por-confirmar', () => ({ PorConfirmar: () => null }));
vi.mock('./proximas', () => ({ Proximas: () => null }));

import { leerDensidadAnual, listarProfesionalesDelAnio } from '@/lib/citas/densidad';

import { CalendarioAnio } from './calendario-anio';
import { cargarContexto } from './datos';
import { Documentacion } from './documentacion';
import { EsqueletoAnio, EsqueletoCalendario } from './esqueletos';
import PaginaAgenda from './page';
import { PorConfirmar } from './por-confirmar';
import { Proximas } from './proximas';

/** Los tipos de componente que aparecen en el árbol, en orden de documento. */
function tiposEnOrden(nodo: ReactNode, salida: unknown[] = []): unknown[] {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) tiposEnOrden(hijo, salida);
  } else if (isValidElement<{ children?: ReactNode }>(nodo)) {
    salida.push(nodo.type);
    tiposEnOrden(nodo.props.children, salida);
  }
  return salida;
}

describe('PaginaAgenda', () => {
  // docs/interfaz.md §Agenda y diseno.md §1.6.1: «Citas próximas», «Por confirmar» y «Documentación».
  it('la columna lateral va en el orden: próximas, por confirmar, documentación', async () => {
    // La página es un `<Suspense>` que envuelve a `Cuerpo`, un componente async: se invoca a mano.
    const pagina = PaginaAgenda({ searchParams: Promise.resolve({}) });
    const cuerpo = tiposEnOrden(pagina).find((tipo) => typeof tipo === 'function' && tipo.name === 'Cuerpo') as (p: {
      searchParams: Promise<Record<string, string>>;
    }) => Promise<ReactNode>;
    const arbol = await cuerpo({ searchParams: Promise.resolve({}) });
    const orden = tiposEnOrden(arbol).filter((tipo) => [Proximas, PorConfirmar, Documentacion].includes(tipo as never));
    expect(orden).toEqual([Proximas, PorConfirmar, Documentacion]);
  });
});

type Cuerpo = (p: { searchParams: Promise<Record<string, string>> }) => Promise<ReactNode>;
type Elemento = ReactElement<Record<string, unknown>>;
type Suspendido = ReactElement<{ fallback: Elemento; children: Elemento }>;

function elementos(nodo: ReactNode, salida: Elemento[] = []) {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) elementos(hijo, salida);
  } else if (isValidElement<{ children?: ReactNode }>(nodo)) {
    salida.push(nodo as Elemento);
    elementos(nodo.props.children, salida);
  }
  return salida;
}

async function cuerpoCon(sp: Record<string, string>) {
  const pagina = PaginaAgenda({ searchParams: Promise.resolve(sp) });
  const cuerpo = tiposEnOrden(pagina).find((tipo) => typeof tipo === 'function' && tipo.name === 'Cuerpo') as Cuerpo;
  return cuerpo({ searchParams: Promise.resolve(sp) });
}

/** El `<Suspense>` del calendario: el que envuelve a `BloqueCalendario` o a `BloqueAnio`. */
function suspenseDelCalendario(arbol: ReactNode): Suspendido {
  const el = elementos(arbol).find((e) => {
    const hijo = e.props.children;
    return (
      e.type === Suspense &&
      isValidElement(hijo) &&
      typeof hijo.type === 'function' &&
      /^Bloque(Calendario|Anio)$/.test(hijo.type.name)
    );
  });
  if (!el) throw new Error('no hay bloque de calendario');
  return el as unknown as Suspendido;
}

async function ejecutar(bloque: Elemento) {
  return await (bloque.type as (p: unknown) => Promise<Elemento>)(bloque.props);
}

function contexto(extra: Record<string, unknown>) {
  vi.mocked(cargarContexto).mockResolvedValue({
    ok: true,
    sesion: { usuario: { id: 'u1' } },
    rol: 'administrador',
    centros: [],
    centro: null,
    zona: 'Europe/Madrid',
    hoy: '2026-03-10',
    ahora: new Date('2026-03-10T10:00:00Z'),
    ...extra,
  } as never);
}

describe('PaginaAgenda · vista anual (T-047)', () => {
  it('con vista=anio el calendario es BloqueAnio con el esqueleto del año; si no, el de siempre', async () => {
    const anio = suspenseDelCalendario(await cuerpoCon({ vista: 'anio' }));
    expect(anio.props.fallback.type).toBe(EsqueletoAnio);
    expect((anio.props.children.type as { name: string }).name).toBe('BloqueAnio');

    const otros: Record<string, string>[] = [{}, { vista: 'mes' }];
    for (const sp of otros) {
      const otro = suspenseDelCalendario(await cuerpoCon(sp));
      expect(otro.props.fallback.type).toBe(EsqueletoCalendario);
      expect((otro.props.children.type as { name: string }).name).toBe('BloqueCalendario');
    }
  });

  it('BloqueAnio pide el año en la zona del centro, con centro y profesional, y pinta CalendarioAnio', async () => {
    const centro = '11111111-1111-4111-8111-111111111111';
    const profesional = '22222222-2222-4222-8222-222222222222';
    contexto({ centros: [{ id: centro, nombre: 'Centro Norte' }], centro });
    vi.mocked(leerDensidadAnual).mockResolvedValue({ ok: true, dias: [{ dia: '2026-03-03', recuento: 2 }] });
    vi.mocked(listarProfesionalesDelAnio).mockResolvedValue({
      ok: true,
      profesionales: [{ id: profesional, nombre: 'Ana Ruiz' }],
    });

    const anio = suspenseDelCalendario(await cuerpoCon({ vista: 'anio', fecha: '2026-03-10', centro, profesional }));
    const arbol = await ejecutar(anio.props.children);

    const rango = { desde: new Date('2025-12-31T23:00:00.000Z'), hasta: new Date('2026-12-31T23:00:00.000Z') };
    expect(leerDensidadAnual).toHaveBeenCalledWith(expect.anything(), {
      ...rango,
      zona: 'Europe/Madrid',
      centroId: centro,
      profesionalId: profesional,
    });
    expect(listarProfesionalesDelAnio).toHaveBeenCalledWith(expect.anything(), {
      ...rango,
      zona: 'Europe/Madrid',
      centroId: centro,
    });
    expect(arbol.type).toBe(CalendarioAnio);
    expect(arbol.key).toBe('anio-2026-03-10');
    expect(arbol.props.parametros).toEqual({ centro, profesional });
    expect(arbol.props.centroElegido).toBe(centro);
    expect((arbol.props.vista as { total: number }).total).toBe(2);
    expect((arbol.props.vista as { profesionales: unknown }).profesionales).toEqual([
      { id: profesional, nombre: 'Ana Ruiz' },
    ]);
  });

  it('si la base falla, BloqueAnio muestra el aviso de error y no el calendario', async () => {
    contexto({});
    vi.mocked(leerDensidadAnual).mockResolvedValue({ ok: false, motivo: 'desconocido', mensaje: 'No se pudo.' } as never);
    vi.mocked(listarProfesionalesDelAnio).mockResolvedValue({ ok: true, profesionales: [] });

    const anio = suspenseDelCalendario(await cuerpoCon({ vista: 'anio' }));
    const arbol = await ejecutar(anio.props.children);
    expect(arbol.type).not.toBe(CalendarioAnio);
    expect(arbol.props.mensaje).toBe('No se pudo.');
  });

  it('si falla la lista de profesionales, BloqueAnio muestra el aviso de error y no una lista vacía', async () => {
    contexto({});
    vi.mocked(leerDensidadAnual).mockResolvedValue({ ok: true, dias: [{ dia: '2026-03-03', recuento: 2 }] });
    vi.mocked(listarProfesionalesDelAnio).mockResolvedValue({
      ok: false,
      motivo: 'desconocido',
      mensaje: 'No se pudo la lista.',
    } as never);

    const anio = suspenseDelCalendario(await cuerpoCon({ vista: 'anio' }));
    const arbol = await ejecutar(anio.props.children);
    expect(arbol.type).not.toBe(CalendarioAnio);
    expect(arbol.props.mensaje).toBe('No se pudo la lista.');
  });
});
