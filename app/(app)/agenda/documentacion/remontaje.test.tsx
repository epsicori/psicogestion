import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { redirect } from 'next/navigation';
import { RedirectBoundary } from 'next/dist/client/components/redirect-boundary';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { createContext, useContext, useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GrupoPresentado } from '../pendientes';
import { idEnlacePaciente } from '../pendientes-ids';
import { MemoriaResolucion, ProveedorResolucion, ResolverAlerta } from '../resolver-alerta';
import { Buscador } from './buscador';
import { ID_TITULO } from './parametros';

/**
 * R2-H1 (T-048, ronda 3): la redirección de `?pagina` desmonta la página entera. Aquí se
 * reproduce con el `RedirectBoundary` REAL de Next y un `redirect()` real lanzado en render, no
 * con un `rerender`: la aserción `h2 !== h2Antes` es la que impide que el arnés degenere en uno.
 * El orden de fuera a dentro es el de Next: layout (la memoria) > límite del segmento > página.
 */

const m = vi.hoisted(() => ({ resolverAlerta: vi.fn(), buscarPendientes: vi.fn() }));
vi.mock('../acciones-alertas', () => ({ resolverAlerta: m.resolverAlerta }));
vi.mock('./acciones', () => ({ buscarPendientes: m.buscarPendientes }));

type Datos = { pagina: number; revalidada: boolean; pacientes3: string[] };
const INICIAL: Datos = { pagina: 3, revalidada: false, pacientes3: ['P21'] };
const PAGINA_2 = Array.from({ length: 20 }, (_, i) => `P${i + 1}`);

const ContextoDatos = createContext<Datos>(INICIAL);
const manejador: { fijar: (d: Datos) => void } = { fijar: () => {} };
const fijarDatos = (d: Datos) => manejador.fijar(d);
const routerFalso = {
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
};

const alertaDe = (id: string) => `a-${id}`;
const etiquetaDe = (id: string) => `Informe de ${id}`;

function ContenidoFalso() {
  const d = useContext(ContextoDatos);
  const ids = d.pagina === 3 ? d.pacientes3 : PAGINA_2;
  // Como `contenido.tsx`: fuera de rango tras la revalidación, `redirect` durante el render.
  if (d.pagina === 3 && d.revalidada && ids.length === 0) redirect('/agenda/documentacion?pagina=2');
  return (
    <Buscador tipo={null} nivel={null} pagina={d.pagina}>
      <ProveedorResolucion
        prefijo="pagina"
        encabezadoId={ID_TITULO}
        pacientes={ids.map((id) => ({ id, alertas: [alertaDe(id)], anuncio: `${id}, 1 pendiente` }))}
      >
        <ul>
          {ids.map((id) => (
            <li key={id}>
              <a id={idEnlacePaciente('pagina', id)} href="#">
                {id}
              </a>
              <ResolverAlerta alertaId={alertaDe(id)} pacienteId={id} etiquetaTipo={etiquetaDe(id)} />
            </li>
          ))}
        </ul>
      </ProveedorResolucion>
    </Buscador>
  );
}

function PaginaFalsa() {
  return (
    <>
      <h2 id={ID_TITULO} tabIndex={-1}>
        Documentación pendiente
      </h2>
      <ContenidoFalso />
    </>
  );
}

function Arnes({ inicial }: { inicial: Datos }) {
  const [datos, setDatos] = useState(inicial);
  useEffect(() => {
    manejador.fijar = setDatos;
  }, []);
  return (
    <ContextoDatos.Provider value={datos}>
      <AppRouterContext.Provider value={routerFalso as never}>
        <MemoriaResolucion>
          <RedirectBoundary>
            <PaginaFalsa />
          </RedirectBoundary>
        </MemoriaResolucion>
      </AppRouterContext.Provider>
    </ContextoDatos.Provider>
  );
}

function grupoDeP21(): GrupoPresentado {
  const pendiente = (id: string, etiqueta: string) => ({
    id,
    etiquetaTipo: etiqueta,
    textoDesde: 'pendiente desde hoy',
    pildora: null,
    destino: '/pacientes/P21',
    nombreEnlace: `${etiqueta} de P21: ir a la ficha`,
    resoluble: true,
  });
  return {
    pacienteId: 'P21',
    nombre: 'P21',
    hrefPaciente: '/pacientes/P21',
    recuento: 2,
    insignia: '2 pendientes',
    urgencia: null,
    textoUrgencia: null,
    textoAccesible: 'P21, 2 pendientes',
    resumen: null,
    anuncio: 'P21, 2 pendientes',
    pendientes: [pendiente(alertaDe('P21'), etiquetaDe('P21')), pendiente('a-P21-otra', 'Otro informe')],
    verTodos: null,
  };
}

const botonResolver = () => screen.getByRole('button', { name: `Marcar como resuelta: ${etiquetaDe('P21')}` });
const regiones = () => document.querySelectorAll('[data-estado-bloque]');

// Toda promesa en vuelo se suelta al acabar cada prueba, falle o no (T-048, ronda 4).
const sueltas: Array<() => void> = [];
function diferido<T>(alSoltar: T) {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  sueltas.push(() => resolver(alSoltar));
  return { promesa, resolver };
}
afterEach(async () => {
  await act(async () => {
    for (const soltar of sueltas.splice(0)) soltar();
  });
});

async function resolverYEsperar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(botonResolver());
  await waitFor(() => expect(m.resolverAlerta).toHaveBeenCalledTimes(1));
  // La acción ha terminado y el bloque ha anotado el pendiente. No se espera a que el botón vuelva
  // a su texto: en la búsqueda, `relanzar` queda en vuelo a propósito y retiene el estado pendiente.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('remontaje por la redirección de ?pagina (R2-H1)', () => {
  beforeEach(() => {
    m.resolverAlerta.mockReset();
    m.resolverAlerta.mockResolvedValue({ ok: true });
    m.buscarPendientes.mockReset();
    for (const f of Object.values(routerFalso)) f.mockReset();
    // La redirección real hace `router.replace`: el arnés responde con la página 2 revalidada.
    routerFalso.replace.mockImplementation(() => fijarDatos({ pagina: 2, revalidada: true, pacientes3: [] }));
    routerFalso.push.mockImplementation(() => fijarDatos({ pagina: 2, revalidada: true, pacientes3: [] }));
    // React registra el error de redirección capturado: no es una aserción, solo ruido.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('el último de la última página: tras la redirección real, foco al último de la página 2 y anuncio en el mismo nodo', async () => {
    const user = userEvent.setup();
    render(<Arnes inicial={INICIAL} />);
    await resolverYEsperar(user);

    const h2Antes = document.getElementById(ID_TITULO);
    const regionAntes = document.querySelector('[data-estado-bloque]');
    expect(regionAntes).not.toBeNull();
    expect(regionAntes!.textContent).toBe('');

    act(() => fijarDatos({ pagina: 3, revalidada: true, pacientes3: [] }));

    await waitFor(() => expect(document.activeElement?.id).toBe(idEnlacePaciente('pagina', 'P20')));
    const llamadas = routerFalso.replace.mock.calls.length + routerFalso.push.mock.calls.length;
    expect(llamadas).toBe(1);
    const destino = (routerFalso.replace.mock.calls[0] ?? routerFalso.push.mock.calls[0])[0];
    expect(destino).toBe('/agenda/documentacion?pagina=2');
    // El remontaje ocurrió de verdad: el título es otro nodo.
    expect(document.getElementById(ID_TITULO)).not.toBe(h2Antes);
    // La región vive por encima del límite: el mismo nodo, ya con el anuncio.
    expect(document.querySelector('[data-estado-bloque]')).toBe(regionAntes);
    expect(regionAntes!.textContent).toContain('Marcada como resuelta.');
    expect(regiones()).toHaveLength(1);
  });

  it('resuelta desde la búsqueda y redirigida: foco al título, anuncio en el mismo nodo', async () => {
    const user = userEvent.setup();
    m.buscarPendientes.mockResolvedValueOnce({
      fase: 'resultados',
      grupos: [grupoDeP21()],
      coincidencias: 1,
      recortada: false,
      leidos: 2,
      total: 2,
    });
    // `relanzar` queda en vuelo: la redirección llega antes que su respuesta.
    const vacio = { fase: 'resultados', grupos: [], coincidencias: 0, recortada: false, leidos: 0, total: 0 };
    const relanzada = diferido(vacio);
    m.buscarPendientes.mockReturnValue(relanzada.promesa);
    render(<Arnes inicial={INICIAL} />);

    await user.type(screen.getByLabelText('Buscar por nombre o apellidos'), 'p21');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    const desplegable = await screen.findByRole('button', { name: 'P21, 2 pendientes' });
    desplegable.focus();
    await user.keyboard('{Enter}');
    expect(desplegable.getAttribute('aria-expanded')).toBe('true');

    await resolverYEsperar(user);
    const h2Antes = document.getElementById(ID_TITULO);
    const regionAntes = document.querySelector('[data-estado-bloque]');

    act(() => fijarDatos({ pagina: 3, revalidada: true, pacientes3: [] }));
    // La acción en vuelo retiene las transiciones de React: se contesta cuando la redirección ya
    // pidió la página nueva (el buscador viejo ya está desmontado, esa respuesta no lo alcanza).
    await waitFor(() => expect(routerFalso.replace).toHaveBeenCalledTimes(1));
    await act(async () => relanzada.resolver(vacio));

    await waitFor(() => expect(document.activeElement?.id).toBe(ID_TITULO));
    expect(document.getElementById(ID_TITULO)).not.toBe(h2Antes);
    expect(document.querySelector('[data-estado-bloque]')).toBe(regionAntes);
    expect(regionAntes!.textContent).toContain('Marcada como resuelta.');
    expect(document.activeElement?.id).not.toBe(idEnlacePaciente('pagina', 'P20'));
    expect(regiones()).toHaveLength(1);
  });

  it('gemelo: sin redirección (la página sigue teniendo pacientes) el foco va al vecino de su índice', async () => {
    const user = userEvent.setup();
    render(<Arnes inicial={{ pagina: 3, revalidada: false, pacientes3: ['P21', 'P22'] }} />);
    await resolverYEsperar(user);

    act(() => fijarDatos({ pagina: 3, revalidada: true, pacientes3: ['P22'] }));

    await waitFor(() => expect(document.activeElement?.id).toBe(idEnlacePaciente('pagina', 'P22')));
    expect(routerFalso.replace).not.toHaveBeenCalled();
    expect(routerFalso.push).not.toHaveBeenCalled();
    expect(regiones()).toHaveLength(1);
    expect(regiones()[0].textContent).toBe('Marcada como resuelta.');
  });
});
